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
const hubUtils = require("/data-hub/5/impl/hub-utils.sjs");
const ps = require('/MarkLogic/provenance');

const provenanceNamespaces = {
  dhf:"http://marklogic.com/dhf",
  job:"http://marklogic.com/data-hub/job#",
  step:"http://marklogic.com/data-hub/step#",
  user:"http://marklogic.com/data-hub/user#",
  dh:"http://marklogic.com/data-hub/provenance#"
};
/**
 * Captures the content objects that should be written to a database after one or more steps
 * have been executed on a batch of items. Supports multiple databases, such that the same URI
 * can be written to multiple databases.
 *
 * If multiple content objects are added that have the same URI and are to be written to the same
 * database, the newer content object will replaced the existing one. This is intended both to avoid
 * conflicting update errors and to facilitate the need when running connected steps for the output of
 * one step to replace the output of a previous step. Trace logging is used to record this so that a
 * user can have visibility into when this happens.
 */
class ProvenanceWriteQueue {

  constructor() {
    this.databaseToRecordQueue = {};
  }

  /**
   * @param databaseName
   * @param provenanceRecord
   */
  addProvenanceRecord(databaseName, provenanceRecord) {
    let recordQueue = this.databaseToRecordQueue[databaseName];
    if (!recordQueue) {
      recordQueue = [];
      this.databaseToRecordQueue[databaseName] = recordQueue;
    }
    let existingForId = recordQueue.find((recordDetails) => recordDetails.id === provenanceRecord.id);
    if (existingForId) {
      Object.assign(existingForId, provenanceRecord);
    } else {
      recordQueue.push(provenanceRecord);
    }
  }

  /**
   * @param databaseName
   * @return provenanceRecordQueue array of provenance records to write to the database
   */
  getDatabaseQueue(databaseName) {
    return this.databaseToRecordQueue[databaseName] || [];
  }

  /**
   * @param databaseName name of the database queue to persist
   * @return void
   */

  persist(databaseName = xdmp.databaseName(xdmp.database())) {
    xdmp.securityAssert("http://marklogic.com/xdmp/privileges/ps-user", "execute");
    const currentDatabaseName  = xdmp.databaseName(xdmp.database());
    if (databaseName === currentDatabaseName) {
      this._persist(databaseName);
    } else {
      xdmp.invokeFunction(() => { this._persist(databaseName)},
        { database: xdmp.database(databaseName), update: "true" , commit: "auto"}
        );
    }
  }

  _persist(databaseName) {
    const recordsQueue  = this.getDatabaseQueue(databaseName) || [];
    if (recordsQueue.length > 0) {
      hubUtils.hubTrace(consts.TRACE_FLOW, `Committing provenance records, count: ${recordsQueue.length}`);
    } else {
      hubUtils.hubTrace(consts.TRACE_FLOW, `No provenance records were queued, so not committing any to the jobs database`);
    }
    for (let recordDetails of recordsQueue) {
      let options = recordDetails.options || {};
      options.dateTime = String(fn.currentDateTime());
      // namespaces for user defined provenance types
      options.namespaces = provenanceNamespaces;

      // relations
      options.relations = options.relations || {};
      options.relations.attributedTo = options.relations.attributedTo || xdmp.getCurrentUser();

      // attributes
      options.attributes = options.attributes || {};

      let metadata = recordDetails.metadata || {};
      if (metadata)
        Object.assign(options.attributes, metadata)

      let record = ps.provenanceRecord(fn.replace(recordDetails.id, "%%dateTime%%", options.dateTime), options);
      ps.provenanceRecordInsert(record);
    }
    this.databaseToRecordQueue[databaseName] = [];
  }

}

module.exports = ProvenanceWriteQueue;
