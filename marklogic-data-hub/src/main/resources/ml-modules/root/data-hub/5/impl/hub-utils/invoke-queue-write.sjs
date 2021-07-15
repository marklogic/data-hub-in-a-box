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

declareUpdate();

// The array of content objects to write
var contentArray;
// provenanceQueue to persist;
var provenanceQueue;

const consts = require("/data-hub/5/impl/consts.sjs");
const hubUtils = require("/data-hub/5/impl/hub-utils.sjs");
const temporal = require("/MarkLogic/temporal.xqy");
const temporalLib = require("/data-hub/5/temporal/hub-temporal.sjs");

const traceEvent = consts.TRACE_FLOW_DEBUG;
const traceEnabled = xdmp.traceEnabled(traceEvent);
const databaseName = xdmp.databaseName(xdmp.database());

/**
 * Delete the document with the URI in the given content object.
 *
 * @param content
 * @param temporalCollection optional; should only be non-null if document is currently in a temporal collection
 */
function deleteContent(content, temporalCollection) {
  const uri = content.uri;
  if (fn.docAvailable(uri)) {
    if (temporalCollection) {
      temporal.documentDelete(temporalCollection, uri);
    } else {
      xdmp.documentDelete(content.uri);
    }
  }
}

// Create a map of all temporal collections for quick checks on whether or not a collection is a temporal one
// Note that if this logic were to move elsewhere, we need to be careful to run it against the 
// correct target database.
const temporalCollectionMap = temporalLib.getTemporalCollections().toArray().reduce((collectionMap, collectionName) => {
  collectionMap[collectionName] = true;
  return collectionMap;
}, {});

for (let content of contentArray) {
  const context = (content.context || {});
  const permissions = context.permissions;
  const targetCollections = context.collections || [];
  const temporalCollection = targetCollections.concat(xdmp.documentGetCollections(content.uri))
    .find(collection => temporalCollectionMap[collection]);

  if (!!content['$delete']) {
    deleteContent(content, temporalCollection);
  } else {
    const metadata = context.metadata;
    const quality = context.quality || 0;

    if (temporalCollection) {
      // temporalDocURI is managed by the temporal package and must not be carried forward.
      if (metadata) {
        delete metadata.temporalDocURI;
      }
      const collectionsReservedForTemporal = ['latest', content.uri];
      if (traceEnabled) {
        hubUtils.hubTrace(traceEvent, `Inserting temporal document ${content.uri} into database ${databaseName}`);
      }
      temporal.documentInsert(temporalCollection, content.uri, content.value, {
        permissions,
        collections: targetCollections.filter((col) => !(temporalCollectionMap[col] || collectionsReservedForTemporal.includes(col))),
        quality: quality,
        metadata
      });
    } else {
      if (traceEnabled) {
        hubUtils.hubTrace(traceEvent, `Inserting document ${content.uri} into database ${databaseName}`);
      }
      xdmp.documentInsert(content.uri, content.value, {permissions, collections: targetCollections, quality: quality, metadata});
    }
  }
}

const writeInfo = {
  databaseName,
  transactionId: xdmp.transaction(),
  transactionDateTime: fn.currentDateTime()
};

if (provenanceQueue) {
  provenanceQueue.persist();
}
writeInfo;
