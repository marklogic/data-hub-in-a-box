declareUpdate();

var uris;
var content;
var options;
var flowName;
var stepNumber;
var step;

for (const contentObject of content) {
  xdmp.documentInsert("/afterHook" + contentObject.uri, contentObject.value, contentObject.context.permissions);
}
