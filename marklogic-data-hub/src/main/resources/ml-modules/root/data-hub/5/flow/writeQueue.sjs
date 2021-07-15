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
const flowUtils = require("/data-hub/5/impl/flow-utils.sjs");
const hubUtils = require("/data-hub/5/impl/hub-utils.sjs");
const provLib = require("/data-hub/5/impl/prov.sjs");

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
class WriteQueue {

  constructor() {
    this.databaseToContentMap = {};
  }

  /**
   * @param databaseName
   * @param contentObject
   * @param flowName only needed for logging
   * @param stepNumber only needed for logging
   */
  addContent(databaseName, contentObject, flowName, stepNumber) {
    let contentMap = this.databaseToContentMap[databaseName];
    if (!contentMap) {
      contentMap = {};
      this.databaseToContentMap[databaseName] = contentMap;
    }

    const traceEvent = consts.TRACE_FLOW;
    const traceEnabled = xdmp.traceEnabled(traceEvent);

    const uri = contentObject.uri;
    if (!uri) {
      if (traceEnabled) {
        let message = `Could not add content object ${xdmp.toJsonString(contentObject)} to write queue because it has `;
        message += `no 'uri' property; flow: ${flowName}; step number: ${stepNumber}`;
        hubUtils.hubTrace(traceEvent, message);
      }
    } else {
      if (contentMap[uri] && traceEnabled) {
        let message = `URI '${uri}' already exists in writeQueue, will be overwritten with new content object`;
        message += `; flow: ${flowName}; step number: ${stepNumber}`;
        hubUtils.hubTrace(traceEvent, message);
      }
      contentMap[uri] = contentObject;
    }
  }

  /**
   * @param databaseName
   * @returns an array of URIs corresponding to the content objects that will be persisted to the given database
   */
  getContentUris(databaseName) {
    const contentMap = this.getContentMap(databaseName);
    return contentMap ? Object.keys(contentMap) : [];
  }

  /**
   * @param databaseName
   * @returns an array of content objects that will be persisted to the given database
   */
  getContentArray(databaseName) {
    const contentMap = this.getContentMap(databaseName);
    return contentMap ? hubUtils.getObjectValues(contentMap) : [];
  }

  getContentMap(databaseName) {
    return this.databaseToContentMap[databaseName];
  }

  /**
   * @return {array} an array of objects about each transaction; each object consists of properties "databaseName", "transactionId", and "transactionDateTime"
   */
  persist() {
    const writeInfos = [];
    Object.keys(this.databaseToContentMap).forEach(databaseName => {
      writeInfos.push(flowUtils.writeContentArray(this.getContentArray(databaseName), databaseName, provLib.getProvenanceWriteQueue()));
    });
    return writeInfos;
  }
}

module.exports = WriteQueue;
