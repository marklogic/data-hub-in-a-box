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

xdmp.securityAssert("http://marklogic.com/data-hub/privileges/read-mapping", "execute");

const esMappingLib = require("/data-hub/5/builtins/steps/mapping/entity-services/lib.sjs");
const hubUtils = require("/data-hub/5/impl/hub-utils.sjs");

var jsonMapping, uri, database;
hubUtils.invokeFunction(function () {
  return esMappingLib.validateAndTestMapping(jsonMapping.toObject(), uri);
}, database);
