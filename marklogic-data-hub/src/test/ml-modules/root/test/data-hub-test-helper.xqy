xquery version "1.0-ml";

(:
Contains functions for simplifying the act of writing tests for Data Hub, particularly tests that need to
load one or more kinds of DHF artifacts.
:)

module namespace hub-test = "http://marklogic.com/data-hub/test";

import module namespace config = "http://marklogic.com/data-hub/config" at "/com.marklogic.hub/config.xqy";
import module namespace cvt = "http://marklogic.com/cpf/convert" at "/MarkLogic/conversion/convert.xqy";
import module namespace test = "http://marklogic.com/test" at "/test/test-helper.xqy";

declare variable $TYPE-TO-COLLECTION-MAP := map:new((
  map:entry("flows", "http://marklogic.com/data-hub/flow"),
  map:entry("entities", "http://marklogic.com/entity-services/models"),
  map:entry("mappings", "http://marklogic.com/data-hub/mappings"),
  map:entry("steps/ingestion", ("http://marklogic.com/data-hub/steps/ingestion","http://marklogic.com/data-hub/steps")),
  map:entry("steps/mapping", ("http://marklogic.com/data-hub/mappings","http://marklogic.com/data-hub/steps/mapping","http://marklogic.com/data-hub/steps")),
  map:entry("steps/matching", ("http://marklogic.com/data-hub/steps/matching","http://marklogic.com/data-hub/steps")),
  map:entry("steps/merging", ("http://marklogic.com/data-hub/steps/merging","http://marklogic.com/data-hub/steps")),
  map:entry("steps/custom", ("http://marklogic.com/data-hub/steps/custom","http://marklogic.com/data-hub/steps")),
  map:entry("step-definitions", "http://marklogic.com/data-hub/step-definition"),
  map:entry("loadData", "http://marklogic.com/data-hub/load-data-artifact"),
  map:entry("content", "raw-content")
));

declare variable $TYPE-TO-PERMISSIONS-MAP := map:new((
  map:entry("entities", (xdmp:permission("data-hub-entity-model-reader", "read"), xdmp:permission("data-hub-entity-model-writer", "update"))),
  map:entry("flows", (xdmp:permission("data-hub-flow-reader", "read"), xdmp:permission("data-hub-flow-writer", "update"))),
  map:entry("mappings", (xdmp:permission("data-hub-mapping-reader", "read"), xdmp:permission("data-hub-mapping-writer", "update"))),
  map:entry("steps/ingestion", (xdmp:permission("data-hub-ingestion-reader", "read"), xdmp:permission("data-hub-ingestion-writer", "update"))),
  map:entry("steps/mapping", (xdmp:permission("data-hub-mapping-reader", "read"), xdmp:permission("data-hub-mapping-writer", "update"))),
  map:entry("steps/matching", (xdmp:permission("data-hub-match-merge-reader", "read"), xdmp:permission("data-hub-match-merge-writer", "update"))),
  map:entry("steps/merging", (xdmp:permission("data-hub-match-merge-reader", "read"), xdmp:permission("data-hub-match-merge-writer", "update"))),
  map:entry("steps/custom", (xdmp:permission("data-hub-custom-reader", "read"), xdmp:permission("data-hub-custom-writer", "update"))),
  map:entry("step-definitions", (xdmp:permission("data-hub-step-definition-reader", "read"), xdmp:permission("data-hub-step-definition-writer", "update"))),
  map:entry("content", (xdmp:permission("data-hub-common", "read"), xdmp:permission("data-hub-common", "update")))
));

declare function load-artifacts($caller-path as xs:string) as xs:string*
{
  map:keys($TYPE-TO-COLLECTION-MAP) ! load-artifacts(., $caller-path)
};


declare function load-jobs($caller-path as xs:string) as xs:string*
{
  load-jobs("jobs", $caller-path, "/", ("Job", "Jobs")),
  load-jobs("batches", $caller-path, "/jobs/", ("Batch", "Jobs"))
};

declare private function load-jobs(
  $doc-type as xs:string,
  $caller-path as xs:string,
  $uri-prefix as xs:string,
  $collections as item()*
) as xs:string*
{
  let $test-data-path := get-test-data-path($caller-path)
  for $uri in get-artifact-uris($doc-type, $test-data-path)
  let $path := fn:replace($uri, $test-data-path, "")
  let $content := test:get-test-file($path)
  let $_ := invoke-in-db(function() {
    xdmp:document-insert($uri-prefix || $path, $content, xdmp:default-permissions(), $collections)
  }, $config:JOB-DATABASE)
  return ()
};

(:
A suite setup module may need to load entities in one transaction, then all other artifacts in a separate
transaction so that e.g. mappings validate properly. Thus, this function and load-non-entities can be used for the
two separate tasks.
:)
declare function load-entities($caller-path as xs:string) as xs:string*
{
  load-artifacts("entities", $caller-path)
};

declare function load-non-entities($caller-path as xs:string) as xs:string*
{
  for $key in map:keys($TYPE-TO-COLLECTION-MAP)
  where fn:not($key = "entities")
  return load-artifacts($key, $caller-path)
};

declare private function load-artifacts(
  $artifact-type as xs:string,
  $caller-path as xs:string
) as xs:string*
{
  let $test-data-path := get-test-data-path($caller-path)

  for $uri in get-artifact-uris($artifact-type, $test-data-path)
  let $path := fn:replace($uri, $test-data-path, "")
  let $artifact-uri := "/" || $path
  let $content := test:get-test-file($path)
  let $permissions := (
    xdmp:default-permissions(),
    map:get($TYPE-TO-PERMISSIONS-MAP, $artifact-type)
  )
  let $collections := (
      map:get($TYPE-TO-COLLECTION-MAP, $artifact-type),
      (: Place entity instances in the correct collection for their instance :)
      if ($artifact-type eq "content") then
        $content/*:envelope/*:instance/*:info/*:title ! fn:string(.)
      else ()
    )
  (: TODO Should really use artifact library for this :)
  let $_ := invoke-in-staging-and-final(function() {
    xdmp:document-insert($artifact-uri, $content, $permissions, $collections)
  })
  return $artifact-uri
};

declare function get-artifact-uris(
  $artifact-type as xs:string,
  $test-data-path as xs:string
) as xs:string*
{
  invoke-in-db(
    function() {
      cts:uris((), (), cts:directory-query($test-data-path || $artifact-type || "/", "infinity"))
    }, xdmp:database-name(xdmp:modules-database())
  )
};

declare function get-test-data-path($caller-path as xs:string) as xs:string
{
  fn:replace(
    fn:concat(cvt:basepath($caller-path), "/test-data/"),
    "//", "/"
  )
};

(:
suite-setup files should call this to ensure that no documents created by previous tests are left.
:)
declare function reset-hub() as empty-sequence()
{
  reset-staging-and-final-databases(),
  clear-jobs-database()
};

(:
Clearing via forest-clear can lead to intermittent failures, so just deleting the
two known collections.
:)
declare function clear-jobs-database()
{
  invoke-in-db(function() {
    xdmp:collection-delete("Jobs"),
    xdmp:collection-delete("http://marklogic.com/provenance-services/record")
    }, $config:JOB-DATABASE
  )
};

declare function clear-provenance-records()
{
  clear-provenance-records($config:JOB-DATABASE)
};

declare function clear-provenance-records($database-name as xs:string)
{
  invoke-in-db(function() {
    xdmp:collection-delete("http://marklogic.com/provenance-services/record")
  }, $database-name
  )
};

(:
We want to remove everything from the schemas database except for the step response TDE
which is added as part of the deployment process.
Also enabling "ifNotExists" option so that the document-delete function does not complain
if the document URI is not found which can happen if the document is already deleted
by a database trigger.
:)
declare function clear-schemas-databases()
{
  invoke-in-staging-and-final-schema-database(function() {
    cts:uris((), (), cts:not-query(cts:collection-query("hub-template"))) ! xdmp:document-delete(., map:map() => map:with("ifNotExists", "allow"))
  })
};

declare function reset-staging-and-final-databases()
{
  invoke-in-staging-and-final(function() {
    cts:uris((), (), cts:not-query(cts:collection-query("hub-core-artifact"))) ! xdmp:document-delete(.)
  })
};

declare function invoke-in-staging-and-final($function)
{
  ($config:STAGING-DATABASE, $config:FINAL-DATABASE) ! invoke-in-db($function, .)
};

declare function invoke-in-staging-and-final-schema-database($function)
{
  ("data-hub-final-SCHEMAS", "data-hub-staging-SCHEMAS") ! invoke-in-db($function, .)
};

declare function get-staging-collection-size($collection-name as xs:string) as xs:integer
{
  invoke-in-db(function(){xdmp:estimate(fn:collection($collection-name))}, $config:STAGING-DATABASE)
};

declare function get-final-collection-size($collection-name as xs:string) as xs:integer
{
  invoke-in-db(function(){xdmp:estimate(fn:collection($collection-name))}, $config:FINAL-DATABASE)
};

declare function get-job-collection-size($collection-name as xs:string) as xs:integer
{
  invoke-in-db(function(){xdmp:estimate(fn:collection($collection-name))}, $config:JOB-DATABASE)
};

declare function get-first-batch-document()
{
  invoke-in-db(function() {collection("Batch")[1]}, $config:JOB-DATABASE)
};

declare function get-modules-document($uri as xs:string)
{
  invoke-in-db(function() {fn:doc($uri)}, $config:MODULES-DATABASE)
};

declare function get-first-prov-document()
{
  get-first-prov-document($config:JOB-DATABASE)
};

declare function get-first-prov-document($database-name as xs:string)
{
  invoke-in-db(function() {fn:collection("http://marklogic.com/provenance-services/record")[1]}, $database-name)
};

declare function get-prov-documents()
{
  get-prov-documents($config:JOB-DATABASE)
};

declare function get-prov-documents($database-name as xs:string)
{
  invoke-in-db(function() {fn:collection("http://marklogic.com/provenance-services/record")}, $database-name)
};

declare function get-final-schema($uri as xs:string)
{
  xdmp:eval("fn:doc('" || $uri || "')", (), 
    <options xmlns="xdmp:eval">
      <database>{xdmp:database("data-hub-final-SCHEMAS")}</database>
    </options>
  )
};

declare function invoke-in-db($function, $database as xs:string)
{
  xdmp:invoke-function($function,
    <options xmlns="xdmp:eval">
      <database>{xdmp:database($database)}</database>
    </options>
  )
};

declare function assert-called-from-test()
{
  let $stack-uris := (try {
    fn:error()
  } catch ($e) {
    $e/error:stack/error:frame/error:uri ! fn:string()
  })
  let $called-from-test :=
    every $uri in $stack-uris
    satisfies (fn:starts-with($uri, "/test/") or fn:starts-with($uri, "/MarkLogic/") or fn:starts-with($uri, "/marklogic.rest.resource/marklogic-unit-test/"))
  where fn:not($called-from-test)
  return (
    fn:error(xs:QName('EXTERNAL-AMPED-TEST-ATTEMPT'), "This function shouldn't be called outside of the test framework", $stack-uris)
  )
};

declare function assert-in-collections($uri as xs:string, $collections as xs:string+)
{
  let $actual-collections := invoke-in-db(function(){xdmp:document-get-collections($uri)}, $config:FINAL-DATABASE)
  for $c in $collections
  return test:assert-true($actual-collections = $c, "Expected URI " || $uri || " to be in collection " || $c)
};

(:
permissions-string is expected to be role,capability,role,capability,etc
:)
declare function assert-has-permissions($uri as xs:string, $permissions-string as xs:string)
{
  let $actual-perms := invoke-in-db(function(){xdmp:document-get-permissions($uri)}, $config:FINAL-DATABASE)
  let $tokens := fn:tokenize($permissions-string, ",")
  for $token at $index in $tokens
  where math:fmod($index, 2) = 1
  return
    let $role := xdmp:role($token)
    let $capability := $tokens[$index + 1]
    let $exists := fn:exists($actual-perms[sec:role-id = $role and sec:capability = $capability])
    return test:assert-true($exists, "Expected URI " || $uri || " to have permission with role " || $role || " and capability " || $capability)
};


(: Copied from https://github.com/marklogic-community/marklogic-unit-test/issues/14 :)
declare variable $ARRAY-QNAME := fn:QName("http://marklogic.com/xdmp/json", "array");
declare function assert-arrays-equal($expected as item()*, $actual as item()*)
{
  if (xdmp:type(fn:head($expected)) eq $ARRAY-QNAME) then
    test:assert-same-values(json:array-values($expected), json:array-values($actual))
  else
    let $expected-ordered :=
      for $e in $expected
      order by $e
      return $e
    let $actual-ordered :=
      for $a in $actual
      order by $a
      return $a
    return test:assert-equal($expected-ordered, $actual-ordered)
};

declare function run-with-roles-and-privileges($roles, $privileges, $func-or-module, $variables)
{
  hub-test:assert-called-from-test()
  ,
  let $security-options :=
    map:map() =>
    map:with("defaultXqueryVersion", "1.0-ml") =>
    map:with("database", xdmp:security-database())
  let $_ :=
    xdmp:invoke("/test/invoke/create-test-role.xqy",
      json:object() => map:with("roles", $roles) => map:with("privileges", $privileges),
      $security-options
    )

  let $user-id := fn:head(xdmp:invoke("/test/invoke/create-test-user.xqy", (), $security-options))
  let $user-map := map:map() => map:with("userId", $user-id)
  let $clean-up :=
    function() {
      try {
          xdmp:invoke("/test/invoke/delete-test-role.xqy", (), $security-options)
      } catch ($e) {
      }
      ,
      try {
          xdmp:invoke("/test/invoke/delete-test-user.xqy", (), $security-options)
      } catch ($e) {
      }
    }

  return
    try {
      if ($func-or-module instance of xdmp:function) then
        xdmp:invoke-function($func-or-module, $user-map)
      else
        xdmp:invoke($func-or-module, $variables, $user-map)
      ,
      let $_ := $clean-up()
      return ()
    }
    catch ($e) {
      $clean-up(),
      xdmp:rethrow()
    }
};

declare function wait-for-indexes()
{
  wait-for-indexes(1)
};

declare function wait-for-indexes($count as xs:unsignedLong) {
  let $is-indexing := run-with-roles-and-privileges("admin", (), function() {
    0 lt fn:sum(xdmp:forest-counts(xdmp:database-forests(xdmp:database()), (), "preview-reindexer")/*:reindex-refragment-fragment-count, 0)
  }, ())
  return
    if ($is-indexing) then
      let $_sleep := xdmp:sleep(5 * $count)
      return wait-for-indexes($count + 1)
    else
      ()
};