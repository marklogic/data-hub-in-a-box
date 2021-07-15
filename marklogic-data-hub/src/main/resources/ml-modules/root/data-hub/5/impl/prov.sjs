/**
  Copyright (c) 2021 MarkLogic Corporation

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
'use strict';
const consts = require("/data-hub/5/impl/consts.sjs");
const config = require("/com.marklogic.hub/config.sjs");
const hubES = require("/data-hub/5/impl/hub-es.sjs");
const hubUtils = require("/data-hub/5/impl/hub-utils.sjs");
const ps = require('/MarkLogic/provenance');
const op = require('/MarkLogic/optic');
const ProvenanceWriteQueue = require("/data-hub/5/provenance/provenanceWriteQueue.sjs");

const provenanceWriteQueue = new ProvenanceWriteQueue();

function getProvenanceWriteQueue() {
  return provenanceWriteQueue;
}

function newProvId(jobId, flowId, stepType, docUri) {
  return `${jobId + flowId + stepType + docUri}_${sem.uuidString()}`;
}

/**
 * Get array of provTypes for a given step type for provenance record creation
 * @param {string} stepDefinitionType - step definition type ['ingestion','mapping','mastering','matching','merging','custom']
 */
function validStepDefinitionType(stepDefinitionType) {
  return ['ingestion', 'mapping', 'mastering', 'matching', 'merging', 'custom'].includes(stepDefinitionType)
}

/**
 * Validate that the info Object to ensure the metadata passed doesn't stomp on roles or location values
 * @param {Object} info - object representing the information required to create prov info
 */
function validProvInfoMetadata(info) {
  let protectedAttributeProps = ['roles', 'roleNames', 'location'];
  let isValid = info && info.metdata ?
    info.metdata.every(val => !(protectedAttributeProps.includes(val))) :
    true;  // safe, because no metadata
  return isValid || Error(`The following metadata properties on "info" are not allowed: ${JSON.stringify(requiredInfoParams[stepType])}`);
}

/**
 * Validate that the info Object
 * @param {string} stepDefinitionType - step type ['ingestion','mapping','mastering','custom']
 * @param {Object} info - object representing the information required to create prov info
 */
function validProvInfoForStepType(stepDefinitionType, info) {
  let requiredInfoParams = {
    'ingestion': ['derivedFrom'],  // the entity, file or document URI that this ingested document was derived from
    'mapping': ['derivedFrom', 'influencedBy'],
    'mastering': ['derivedFrom', 'influencedBy'],
    'matching': ['derivedFrom', 'influencedBy'],
    'merging': ['derivedFrom', 'influencedBy'],
    'custom': ['derivedFrom', 'influencedBy']
  };
  let provTypes = {
    'ingestion': function () {
      return requiredInfoParams['ingestion'].every(val => Object.keys(info).includes(val));
    },
    'mapping': function () {
      return requiredInfoParams['mapping'].every(val => Object.keys(info).includes(val));
    },
    'mastering': function () {
      return requiredInfoParams['mastering'].every(val => Object.keys(info).includes(val));
    },
    'matching': function () {
      return requiredInfoParams['matching'].every(val => Object.keys(info).includes(val));
    },
    'merging': function () {
      return requiredInfoParams['merging'].every(val => Object.keys(info).includes(val));
    },
    'custom': function () {
      return requiredInfoParams['custom'].every(val => Object.keys(info).includes(val));
    }
  };
  let isValid = provTypes[stepDefinitionType]();
  return isValid || Error(`For Step Definition type ${stepDefinitionType}, the following properties on "info" are required: ${JSON.stringify(requiredInfoParams[stepDefinitionType])}`);
}

/**
 * @desc Validate a provenance record params
 * @param {string} [jobId] - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} stepDefinitionType - the type of step definition within a flow ['ingestion','mapping','mastering','custom']
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.status - the status of the step:
 *                               ie. created/updated/deleted.
 *                               Value is passed through to "provTypes".
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 */
function validateCreateStepParams(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURI, info) {
  let isValid;
  if (flowId && stepName && stepDefinitionName && stepDefinitionType && info) {
    // check step type valid
    if (validStepDefinitionType(stepDefinitionType)) {
      let isProvInfoForStepTypeValid = (jobId) ? validProvInfoForStepType(stepDefinitionType, info) : true;
      let isProvInfoMetaValid = validProvInfoMetadata(info);
      // check prov info valid per type passed
      let hasError = isProvInfoForStepTypeValid instanceof Error || isProvInfoMetaValid instanceof Error;
      if (!hasError) {
        // function params are valid
        isValid = true;
      } else {
        // return Error that relates to prov info object
        isValid = (isProvInfoForStepTypeValid instanceof Error) ? isProvInfoForStepTypeValid : isProvInfoMetaValid;
      }
    } else {
      isValid = new Error(`Step type ${stepDefinitionType} not defined.  Must be of type: 'ingestion','mapping','mastering','custom'.`);
    }
  } else {
    let missingParams = [
      ['flowId', flowId],
      ['stepName', stepName],
      ['stepDefinitionName', stepDefinitionName],
      ['stepDefinitionType', stepDefinitionType],
      ['info', info]
    ].filter((pair) => !pair[1])
      .reduce((pair) => pair[0]);
    isValid = new Error(`Function requires all params 'flowId', 'stepName', 'stepDefinitionName', 'stepDefinitionType' and 'info' to be defined. Missing: ${missingParams}`);
  }
  return isValid;
}

/**
 * General create provenance record function that adds the same relations,
 * attributes, dateTime & namespaces info each record requires.
 * @param {Array} recordsQueue - array of objects with identifier of this provenance information, options, and metadata
 */
function createRecords(recordsQueue, latestProvenance = false) {
  xdmp.eval(`
    declareUpdate();
    recordsQueue.persist();
    `,
    {recordsQueue},
    {
      database: xdmp.database(config.JOBDATABASE),
      commit: 'auto',
      update: 'true',
      ignoreAmps: true
    });
  return recordsQueue.getDatabaseQueue(consts.JOBDATABASE).map((recordDetails) => recordDetails.id);
};

/**
 * General function for adding to the commit queue
 * @param {string} database - the database that the provenance record should be queued for
 * @param {string} id - the identifier of this provenance information
 * @param {Object} options - provenance record options (see individual type requirements below)
 * @param {Object} metadata - provenance record metadata
 */
function queueForCommit(databaseName = config.JOBDATABASE, id, options, metadata) {
  if (xdmp.traceEnabled(consts.TRACE_FLOW_DEBUG)) {
    hubUtils.hubTrace(consts.TRACE_FLOW_DEBUG, `Queueing provenance record with ID: ${id}`);
  }
  provenanceWriteQueue.addProvenanceRecord(databaseName, {id, options, metadata});
};

/**
 * @desc Create a provenance record when a document is run through an ingestion step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} docURI - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the ingestion step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 *   Ingest document from outside source
 *    provTypes: [ "ps:Flow", "ps:File" ],
 *    relations:
 *      - generatedBy (job id)
 *      - derivedFrom (file)
 *      - derivedFrom (uri)
 *      - influencedBy (mapping)
 *      - associatedWith [flow id, step name, step definition name]
 *    attributes:
 *      - location (doc URI)
 */
function createIngestionStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'ingestion', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:IngestionStep', 'dhf:IngestionStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

/**
 * @desc Create a provenance record when a document is run through a mapping step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the mapping step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 *   Map Source document property to Entity Instance property
 *    provTypes: [ "ps:Flow", "ps:EntityProperty", "ps:Mapping", "dhf:ModelToModelMapping" ],
 *    relations:
 *      - generatedBy (job id)
 *      - derivedFrom (uri)
 *      - derivedFrom (array of uris) - not supported in current QuickStart
 *      - influencedBy (mapping)
 *      - influencedBy (component [aka. custom code])
 *      - associatedWith [flow id, step name, step definition name]
 *    attributes:
 *      - location (doc URI)
 */
function createMappingStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'mapping', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:MappingStep', 'dhf:MappingStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
      influencedBy: info && info.influencedBy,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

/**
 * @desc Create a provenance record when a document is run through a mastering step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the mastering step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 *   Master Source doc property to Entity Instance property
 *    provTypes: [ "ps:Flow", "ps:EntityProperty", "dhf:Mastering" ],
 *    relations:
 *      - generatedBy (job id)
 *      - derivedFrom (uri)
 *      - derivedFrom (array of uris)
 *      - influencedBy (mastering)
 *      - influencedBy (component [aka. custom code])
 *      - associatedWith [flow id, step name, step definition name]
 *    attributes:
 *      - location (doc URI)
 */
function createMasteringStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'mastering', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:MasteringStep', 'dhf:MasteringStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
      influencedBy: info && info.influencedBy,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

/**
 * @desc Create a provenance record when a document is run through a matching step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the mastering step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 *   Master Source doc property to Entity Instance property
 *    provTypes: [ "ps:Flow", "ps:EntityProperty", "dhf:Matching" ],
 *    relations:
 *      - generatedBy (job id)
 *      - derivedFrom (uri)
 *      - derivedFrom (array of uris)
 *      - influencedBy (mastering)
 *      - influencedBy (component [aka. custom code])
 *      - associatedWith [flow id, step name, step definition name]
 *    attributes:
 *      - location (doc URI)
 */
function createMatchingStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'matching', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:MatchingStep', 'dhf:MatchingStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
      influencedBy: info && info.influencedBy,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

/**
 * @desc Create a provenance record when a document is run through a merging step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the mastering step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 *   Master Source doc property to Entity Instance property
 *    provTypes: [ "ps:Flow", "ps:EntityProperty", "dhf:Merging" ],
 *    relations:
 *      - generatedBy (job id)
 *      - derivedFrom (uri)
 *      - derivedFrom (array of uris)
 *      - influencedBy (mastering)
 *      - influencedBy (component [aka. custom code])
 *      - associatedWith [flow id, step name, step definition name]
 *    attributes:
 *      - location (doc URI)
 */
function createMergingStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'merging', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:MergingStep', 'dhf:MergingStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
      influencedBy: info && info.influencedBy,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

/**
 * @desc Create a provenance record when a document is run through a custom step
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.derivedFrom - the entity, file or document URI that this ingested document was derived from
 * @param {string} info.influencedBy - the custom step the document was modified by
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 * Custom code transformations of source doc (prior to mapping/mastering) or Entity Instance (after mapping/mastering)
 *  provTypes: [ "ps:Flow", "ps:Entity", "dhf:Custom" ],
 *  relations:
 *    - generatedBy (job id)
 *    - derivedFrom (uri)
 *    - derivedFrom (array of uris)
 *    - influencedBy (component [aka. custom code])
 *    - associatedWith [flow id, step name, step definition name]
 *  attributes:
 *    - location (doc URI)
 */
function createCustomStepRecord(jobId, flowId, stepName, stepDefinitionName, docURI, info) {
  let provId = newProvId(jobId, flowId, 'custom', docURI);
  let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', 'dhf:CustomStep', 'dhf:CustomStepEntity'];
  if (info && info.status)
    provTypes.push('dhf:Doc' + hubUtils.capitalize(info.status));

  let recordOpts = {
    provTypes,
    relations: {
      associatedWith: [flowId, stepName, stepDefinitionName],
      generatedBy: jobId,
      derivedFrom: info && info.derivedFrom,
      influencedBy: info && info.influencedBy,
    },
    attributes: { location: docURI }
  };

  return queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
}

const stepRecordCreationFunctions = {
  createIngestionStepRecord,
  createCustomStepRecord,
  createMappingStepRecord,
  createMasteringStepRecord,
  createMatchingStepRecord,
  createMergingStepRecord
};

/**
 * @desc Create a provenance record when a document is run through a Flow step
 * @param {string} [jobId] - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} stepDefinitionType - the type of step definition within a flow ['ingestion','mapping','mastering','custom']
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {Object} info
 * @param {string} info.status - the status of the step:
 *                               ie. created/updated/deleted.
 *                               Value is passed through to "provTypes".
 * @param {string} [info.metadata] - key/value pairs to document with the provenance record
 */
function createStepRecord(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURI, info) {
  let resp;
  let isValid = validateCreateStepParams(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURI, info);
  if (!(isValid instanceof Error)) {
    let capitalizedStepType = hubUtils.capitalize(stepDefinitionType);
    resp = stepRecordCreationFunctions["create" + capitalizedStepType + "StepRecord"](jobId, flowId, stepName, stepDefinitionName, docURI, info);
  } else {
    resp = isValid
  }
  return resp;
}

/**
 * @desc Create a provenance record for a documents properties.  These records will be used to record property merges.
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} stepDefinitionType - the type of step definition within a flow ['ingestion','mapping','mastering','custom']
 * @param {string} [docURI] - the URI of the document being modified by this step
 * @param {string} docURI - the URI of the document being processed by this step
 * @param {Array}  properties - the properties of the document being processed by this step
 * @param {Object} info
 * @param {string} info.influencedBy - the Step ID assoicated this record
 * @return {Array} Document Prov ID, Document Prov IDs for properties as an Object of
 *                  key/value pairs mapping property names to their provenance IDs,
 *                  for use with follow-up createStepPropertyMergeRecords() call
 */
function createStepPropertyRecords(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURI, properties, info) {
  let resp;
  let docProvId;
  let docPropertyProvIds = {};
  let docPropertyProvIdsArray = [];
  let isValid = validateCreateStepParams(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURI, info);
  if (!(isValid instanceof Error)) {
    if (properties && properties.length > 0) {
      let capitalizedStepType = hubUtils.capitalize(stepDefinitionType);
      for (let i = 0; i < properties.length; i++) {
        let property = properties[i];
        let encodedPropertyName = property;
        if (!xdmp.castableAs("http://www.w3.org/2001/XMLSchema", "QName", encodedPropertyName)) {
          encodedPropertyName = xdmp.encodeForNCName(encodedPropertyName);
        }
        let docPropProvId = `${jobId + flowId + stepDefinitionType + docURI}_${property}`
        let docPropProvOptions = {
          provTypes: ['ps:Flow', 'ps:EntityProperty', `dhf:${capitalizedStepType}`, 'dhf:EntityProperty', encodedPropertyName],
          relations: {
            associatedWith: [flowId, stepName, stepDefinitionName],
            generatedBy: jobId,
            influencedBy: info && info.influencedBy,
          },
          attributes: { location: docURI }
        };
        // append to return Object
        docPropertyProvIds[property] = docPropProvId;
        docPropertyProvIdsArray.push(docPropProvId);
        queueForCommit(config.JOBDATABASE, docPropProvId, docPropProvOptions, info.metadata);
      }

      // create document record
      docProvId = `${jobId + flowId + stepDefinitionType + docURI}`;
      let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:Entity', `dhf:${capitalizedStepType}Entity`];
      let recordOpts = {
        provTypes,
        relations: {
          associatedWith: [flowId, stepName, stepDefinitionName],
          generatedBy: jobId,
          hadMember: docPropertyProvIdsArray,
          influencedBy: info && info.influencedBy,
        },
        attributes: { location: docURI }
      };

      queueForCommit(config.JOBDATABASE, docProvId, recordOpts, info.metadata);

      // construct response
      resp = [docProvId, docPropertyProvIds];
    } else {
      resp = new Error(`Function requires param 'properties' to be defined.`);
    }
  } else {
    resp = isValid
  }
  return resp;
}

/**
 * @desc Create a provenance for altered property record for multiple property records
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} stepDefinitionType - the type of step definition within a flow ['ingestion','mapping','mastering','custom']
 * @param {string} propertyName - the name of the property being merged
 * @param {Array}  docURIs - the URIs of the documents associated with this merge
 * @param {Array}  propertyProvIds - the provenance record ids of the properties being merged by this step
 * @param {Object} info
 * @param {string} info.influencedBy - the Step ID assoicated this record
 * @return {Object} key/value pairs mapping property names to their provenance IDs,
 *                  for use with follow-up createStepPropertyAlterationRecords() call
 */
function createStepPropertyAlterationRecord(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, propertyName, docURIs, propertyProvIds, info) {
  let resp = [];
  let isValid = validateCreateStepParams(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, docURIs, info);
  let activity = 'altered';
  if (stepDefinitionType === 'mapping') {
    activity = 'mapped';
  } else if (stepDefinitionType === 'mastering') {
    activity = 'merged';
  }
  if (!(isValid instanceof Error)) {
    if (docURIs && docURIs.length > 0 &&
      propertyProvIds && propertyProvIds.length > 0) {
      let capitalizedStepType = hubUtils.capitalize(stepDefinitionType);
      let provId = `${jobId + flowId + stepDefinitionType + docURIs.concat()}_${propertyName}_${activity}_${sem.uuidString()}`;
      let encodedPropertyName = propertyName;
      if (!xdmp.castableAs("http://www.w3.org/2001/XMLSchema", "QName", encodedPropertyName)) {
        encodedPropertyName = xdmp.encodeForNCName(encodedPropertyName);
      }
      let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:AlteredEntityProperty', `dhf:${capitalizedStepType}AlteredEntityProperty`, encodedPropertyName];
      let recordOpts = {
        provTypes,
        relations: {
          associatedWith: [flowId, stepName, stepDefinitionName],
          generatedBy: jobId,
          derivedFrom: propertyProvIds,
          influencedBy: info && info.influencedBy,
        }
      };
      queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);

      resp = provId;
    } else {
      resp = new Error(`Function requires param 'docURIs' & 'propertyProvIds' to be defined.`);
    }
  } else {
    resp = isValid
  }
  return resp;
}

/**
 * @desc Create a provenance alteration record for multiple property records
 * @param {string} jobId - the ID of the job being executed (unique), this will generate
 * @param {string} flowId - the unique ID of the flow
 * @param {string} stepName - the name of the step within a flow
 * @param {string} stepDefinitionName - the name of step definition within a flow
 * @param {string} stepDefinitionType - the type of step definition within a flow ['ingestion','mapping','mastering','custom']
 * @param {Array}  docURI - the new URI of the document created after the merge
 * @param {Array}  propertyProvIds - the provenance record ids of the properties being altered by this step
 * @param {Object} info
 * @param {string} info.influencedBy - the Step ID assoicated this record
 * @return {Object} key/value pairs mapping property names to their provenance IDs,
 *                  for use with follow-up createStepDocumentAlterationRecords() call
 */
function createStepDocumentAlterationRecord(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, newDocURI, documentProvIds, alteredPropertyProvIds, info) {
  let resp = [];
  let isValid = validateCreateStepParams(jobId, flowId, stepName, stepDefinitionName, stepDefinitionType, documentProvIds, info);
  if (!(isValid instanceof Error)) {
    if (documentProvIds && documentProvIds.length > 0 &&
      alteredPropertyProvIds && alteredPropertyProvIds.length > 0) {
      let capitalizedStepType = hubUtils.capitalize(stepDefinitionType);
      let provId = newProvId(jobId, flowId, stepDefinitionType, newDocURI);
      let provTypes = ['ps:Flow', 'ps:Entity', 'dhf:AlteredEntity', `dhf:${capitalizedStepType}AlteredEntity`];
      let recordOpts = {
        provTypes,
        relations: {
          associatedWith: [flowId, stepName, stepDefinitionName],
          generatedBy: jobId,
          derivedFrom: documentProvIds,
          hadMember: alteredPropertyProvIds,
          influencedBy: info && info.influencedBy,
        },
        attributes: { location: newDocURI }
      };
      queueForCommit(config.JOBDATABASE, provId, recordOpts, info.metadata);
      resp = provId;
    } else {
      resp = new Error(`Function requires param 'documentProvIds' & 'alteredPropertyProvIds' to be defined.`);
    }
  } else {
    resp = isValid
  }
  return resp;
}

function commit() {
  const jobsProvenanceQueue = provenanceWriteQueue.getDatabaseQueue(config.JOBDATABASE);
  if (jobsProvenanceQueue.length > 0) {
    hubUtils.hubTrace(consts.TRACE_FLOW, `Committing provenance records, count: ${jobsProvenanceQueue.length}`);
    createRecords(provenanceWriteQueue);
  } else {
    hubUtils.hubTrace(consts.TRACE_FLOW, `No provenance records were queued, so not committing any to the jobs database`);
  }
}

function findProvenance(docUri, relations) {
  return xdmp.invokeFunction(function () {
    const match = {
      attributes: {
        location: docUri
      }
    };
    const output = {
      dateTime: '?',
      relations: relations
    };
    const kvPattern = ps.opTriplePattern(match, output);
    return op.fromTriples(kvPattern)
      .select(['provID', 'dateTime', 'attributedTo', op.as('associatedWithDetail', op.jsonString(op.col('associatedWith')))])
      .groupBy(['provID', 'dateTime', 'attributedTo'], op.arrayAggregate('associatedWith', 'associatedWithDetail'))
      .orderBy(op.desc('dateTime')).result();
  }, { 'database': xdmp.database(config.JOBDATABASE) }).toArray();
}

function urisToLatestProvIDs(sourceURIs, database) {
  return fn.head(hubUtils.invokeFunction(() => {
      return sourceURIs.map((sourceURI) => {
        const match = {
          attributes: {
            documentURI: sourceURI,
            database
          }
        };
        const output = {
          dateTime: '?'
        };
        const kvPattern = ps.opTriplePattern(match, output);
        //get latest dateTime
        const result = fn.head(op.fromTriples(kvPattern)
          .select(['dateTime'])
          .orderBy(op.desc('dateTime'))
          .limit(1).result());
        return result ? `${database}:${sourceURI}#${result.dateTime}`: sourceURI;
      });
    },
    config.JOBDATABASE));
}

function queueSourceProvenance(sourceLabel, stepExecutionContext, sourceProvIDs) {
  const sourceProvID = `external:${sourceLabel}#%%dateTime%%`;
  const sourceRecordOptions = {
    provTypes: ["dh:Source","ps:Application"],
    label: sourceLabel,
    attributes: {
      file: stepExecutionContext.combinedOptions.file,
      dataSourceName: stepExecutionContext.combinedOptions.sourceName,
      dataSourceType: stepExecutionContext.combinedOptions.sourceType
    }
  };
  sourceProvIDs.push(sourceProvID);
  queueForCommit(stepExecutionContext.getTargetDatabase(), sourceProvID, sourceRecordOptions, {});
}

function buildRecordEntity(stepExecutionContext, contentObject, hadMember, info) {
  let resp = [];
  const jobId = stepExecutionContext.jobId;
  const stepName = stepExecutionContext.flowStep.name;
  const targetDatabase = stepExecutionContext.getTargetDatabase();
  const entityInfo = hubES.getEntityInfoFromRecord(contentObject.value);
  const sourceProvIDs = contentObject.previousUri ? urisToLatestProvIDs(hubUtils.normalizeToArray(contentObject.previousUri)): [];
  let provId = `${targetDatabase}:${contentObject.uri}#%%dateTime%%`
  let attributes = {
      documentURI: contentObject.uri,
      database: targetDatabase,
      stepName
  };
  let provTypes = ["ps:Document"];
  if (info && info.status) {
    provTypes.push(`dhf:Doc${hubUtils.capitalize(info.status)}`);
    const sourceLabel = stepExecutionContext.combinedOptions.file || stepExecutionContext.combinedOptions.sourceName;
    if (info.status === "created" && sourceLabel) {
      queueSourceProvenance(sourceLabel, stepExecutionContext, sourceProvIDs);
    }
  }
  if (entityInfo) {
    provTypes.push("ps:Entity");
    provTypes.push(entityInfo.title);
    attributes.entityName = entityInfo.title;
    attributes.entityVersion = entityInfo.version;
  }
  let influencedBy = info && info.influencedBy;
  let recordOpts = {
    provTypes,
    attributes,
    relations: {
      generatedBy: `job:${jobId}`,
      attributedTo: `user:${xdmp.getCurrentUser()}`,
      derivedFrom: sourceProvIDs,
      hadMember: hadMember,
      influencedBy
    }
  };
  queueForCommit(stepExecutionContext.getTargetDatabase(), provId, recordOpts, info.metadata);
  resp.push(provId);
  return resp;
}

module.exports = {
  getProvenanceWriteQueue,
  buildRecordEntity,
  commit,
  createStepDocumentAlterationRecord,
  createStepPropertyAlterationRecord,
  createStepPropertyRecords,
  createStepRecord,
  findProvenance: module.amp(findProvenance)
};

