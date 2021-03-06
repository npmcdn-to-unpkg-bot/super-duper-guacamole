/* */ 
"use strict";
var __extends = (this && this.__extends) || function(d, b) {
  for (var p in b)
    if (b.hasOwnProperty(p))
      d[p] = b[p];
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var Lint = require('../lint');
var Rule = (function(_super) {
  __extends(Rule, _super);
  function Rule() {
    _super.apply(this, arguments);
  }
  Rule.prototype.apply = function(sourceFile) {
    return this.applyWithWalker(new NoDebuggerWalker(sourceFile, this.getOptions()));
  };
  Rule.FAILURE_STRING = "use of debugger statements is disallowed";
  return Rule;
}(Lint.Rules.AbstractRule));
exports.Rule = Rule;
var NoDebuggerWalker = (function(_super) {
  __extends(NoDebuggerWalker, _super);
  function NoDebuggerWalker() {
    _super.apply(this, arguments);
  }
  NoDebuggerWalker.prototype.visitDebuggerStatement = function(node) {
    var debuggerKeywordNode = node.getChildAt(0);
    this.addFailure(this.createFailure(debuggerKeywordNode.getStart(), debuggerKeywordNode.getWidth(), Rule.FAILURE_STRING));
    _super.prototype.visitDebuggerStatement.call(this, node);
  };
  return NoDebuggerWalker;
}(Lint.RuleWalker));
