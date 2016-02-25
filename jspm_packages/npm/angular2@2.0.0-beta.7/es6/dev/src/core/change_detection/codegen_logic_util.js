/* */ 
"format cjs";
import { IS_DART, isPresent, isBlank } from 'angular2/src/facade/lang';
import { codify, combineGeneratedStrings, rawString } from './codegen_facade';
import { RecordType } from './proto_record';
import { ChangeDetectionStrategy } from './constants';
import { BaseException } from 'angular2/src/facade/exceptions';
/**
 * Class responsible for providing change detection logic for change detector classes.
 */
export class CodegenLogicUtil {
    constructor(_names, _utilName, _changeDetectorStateName, _changeDetection) {
        this._names = _names;
        this._utilName = _utilName;
        this._changeDetectorStateName = _changeDetectorStateName;
        this._changeDetection = _changeDetection;
    }
    /**
     * Generates a statement which updates the local variable representing `protoRec` with the current
     * value of the record. Used by property bindings.
     */
    genPropertyBindingEvalValue(protoRec) {
        return this._genEvalValue(protoRec, idx => this._names.getLocalName(idx), this._names.getLocalsAccessorName());
    }
    /**
     * Generates a statement which updates the local variable representing `protoRec` with the current
     * value of the record. Used by event bindings.
     */
    genEventBindingEvalValue(eventRecord, protoRec) {
        return this._genEvalValue(protoRec, idx => this._names.getEventLocalName(eventRecord, idx), "locals");
    }
    _genEvalValue(protoRec, getLocalName, localsAccessor) {
        var context = (protoRec.contextIndex == -1) ?
            this._names.getDirectiveName(protoRec.directiveIndex) :
            getLocalName(protoRec.contextIndex);
        var argString = protoRec.args.map(arg => getLocalName(arg)).join(", ");
        var rhs;
        switch (protoRec.mode) {
            case RecordType.Self:
                rhs = context;
                break;
            case RecordType.Const:
                rhs = codify(protoRec.funcOrValue);
                break;
            case RecordType.PropertyRead:
                rhs = this._observe(`${context}.${protoRec.name}`, protoRec);
                break;
            case RecordType.SafeProperty:
                var read = this._observe(`${context}.${protoRec.name}`, protoRec);
                rhs =
                    `${this._utilName}.isValueBlank(${context}) ? null : ${this._observe(read, protoRec)}`;
                break;
            case RecordType.PropertyWrite:
                rhs = `${context}.${protoRec.name} = ${getLocalName(protoRec.args[0])}`;
                break;
            case RecordType.Local:
                rhs = this._observe(`${localsAccessor}.get(${rawString(protoRec.name)})`, protoRec);
                break;
            case RecordType.InvokeMethod:
                rhs = this._observe(`${context}.${protoRec.name}(${argString})`, protoRec);
                break;
            case RecordType.SafeMethodInvoke:
                var invoke = `${context}.${protoRec.name}(${argString})`;
                rhs =
                    `${this._utilName}.isValueBlank(${context}) ? null : ${this._observe(invoke, protoRec)}`;
                break;
            case RecordType.InvokeClosure:
                rhs = `${context}(${argString})`;
                break;
            case RecordType.PrimitiveOp:
                rhs = `${this._utilName}.${protoRec.name}(${argString})`;
                break;
            case RecordType.CollectionLiteral:
                rhs = `${this._utilName}.${protoRec.name}(${argString})`;
                break;
            case RecordType.Interpolate:
                rhs = this._genInterpolation(protoRec);
                break;
            case RecordType.KeyedRead:
                rhs = this._observe(`${context}[${getLocalName(protoRec.args[0])}]`, protoRec);
                break;
            case RecordType.KeyedWrite:
                rhs = `${context}[${getLocalName(protoRec.args[0])}] = ${getLocalName(protoRec.args[1])}`;
                break;
            case RecordType.Chain:
                rhs = `${getLocalName(protoRec.args[protoRec.args.length - 1])}`;
                break;
            default:
                throw new BaseException(`Unknown operation ${protoRec.mode}`);
        }
        return `${getLocalName(protoRec.selfIndex)} = ${rhs};`;
    }
    /** @internal */
    _observe(exp, rec) {
        // This is an experimental feature. Works only in Dart.
        if (this._changeDetection === ChangeDetectionStrategy.OnPushObserve) {
            return `this.observeValue(${exp}, ${rec.selfIndex})`;
        }
        else {
            return exp;
        }
    }
    genPropertyBindingTargets(propertyBindingTargets, genDebugInfo) {
        var bs = propertyBindingTargets.map(b => {
            if (isBlank(b))
                return "null";
            var debug = genDebugInfo ? codify(b.debug) : "null";
            return `${this._utilName}.bindingTarget(${codify(b.mode)}, ${b.elementIndex}, ${codify(b.name)}, ${codify(b.unit)}, ${debug})`;
        });
        return `[${bs.join(", ")}]`;
    }
    genDirectiveIndices(directiveRecords) {
        var bs = directiveRecords.map(b => `${this._utilName}.directiveIndex(${b.directiveIndex.elementIndex}, ${b.directiveIndex.directiveIndex})`);
        return `[${bs.join(", ")}]`;
    }
    /** @internal */
    _genInterpolation(protoRec) {
        var iVals = [];
        for (var i = 0; i < protoRec.args.length; ++i) {
            iVals.push(codify(protoRec.fixedArgs[i]));
            iVals.push(`${this._utilName}.s(${this._names.getLocalName(protoRec.args[i])})`);
        }
        iVals.push(codify(protoRec.fixedArgs[protoRec.args.length]));
        return combineGeneratedStrings(iVals);
    }
    genHydrateDirectives(directiveRecords) {
        var res = [];
        var outputCount = 0;
        for (var i = 0; i < directiveRecords.length; ++i) {
            var r = directiveRecords[i];
            var dirVarName = this._names.getDirectiveName(r.directiveIndex);
            res.push(`${dirVarName} = ${this._genReadDirective(i)};`);
            if (isPresent(r.outputs)) {
                r.outputs.forEach(output => {
                    var eventHandlerExpr = this._genEventHandler(r.directiveIndex.elementIndex, output[1]);
                    var statementStart = `this.outputSubscriptions[${outputCount++}] = ${dirVarName}.${output[0]}`;
                    if (IS_DART) {
                        res.push(`${statementStart}.listen(${eventHandlerExpr});`);
                    }
                    else {
                        res.push(`${statementStart}.subscribe({next: ${eventHandlerExpr}});`);
                    }
                });
            }
        }
        if (outputCount > 0) {
            var statementStart = 'this.outputSubscriptions';
            if (IS_DART) {
                res.unshift(`${statementStart} = new List(${outputCount});`);
            }
            else {
                res.unshift(`${statementStart} = new Array(${outputCount});`);
            }
        }
        return res.join("\n");
    }
    genDirectivesOnDestroy(directiveRecords) {
        var res = [];
        for (var i = 0; i < directiveRecords.length; ++i) {
            var r = directiveRecords[i];
            if (r.callOnDestroy) {
                var dirVarName = this._names.getDirectiveName(r.directiveIndex);
                res.push(`${dirVarName}.ngOnDestroy();`);
            }
        }
        return res.join("\n");
    }
    _genEventHandler(boundElementIndex, eventName) {
        if (IS_DART) {
            return `(event) => this.handleEvent('${eventName}', ${boundElementIndex}, event)`;
        }
        else {
            return `(function(event) { return this.handleEvent('${eventName}', ${boundElementIndex}, event); }).bind(this)`;
        }
    }
    _genReadDirective(index) {
        var directiveExpr = `this.getDirectiveFor(directives, ${index})`;
        // This is an experimental feature. Works only in Dart.
        if (this._changeDetection === ChangeDetectionStrategy.OnPushObserve) {
            return `this.observeDirective(${directiveExpr}, ${index})`;
        }
        else {
            return directiveExpr;
        }
    }
    genHydrateDetectors(directiveRecords) {
        var res = [];
        for (var i = 0; i < directiveRecords.length; ++i) {
            var r = directiveRecords[i];
            if (!r.isDefaultChangeDetection()) {
                res.push(`${this._names.getDetectorName(r.directiveIndex)} = this.getDetectorFor(directives, ${i});`);
            }
        }
        return res.join("\n");
    }
    genContentLifecycleCallbacks(directiveRecords) {
        var res = [];
        var eq = IS_DART ? '==' : '===';
        // NOTE(kegluneq): Order is important!
        for (var i = directiveRecords.length - 1; i >= 0; --i) {
            var dir = directiveRecords[i];
            if (dir.callAfterContentInit) {
                res.push(`if(${this._names.getStateName()} ${eq} ${this._changeDetectorStateName}.NeverChecked) ${this._names.getDirectiveName(dir.directiveIndex)}.ngAfterContentInit();`);
            }
            if (dir.callAfterContentChecked) {
                res.push(`${this._names.getDirectiveName(dir.directiveIndex)}.ngAfterContentChecked();`);
            }
        }
        return res;
    }
    genViewLifecycleCallbacks(directiveRecords) {
        var res = [];
        var eq = IS_DART ? '==' : '===';
        // NOTE(kegluneq): Order is important!
        for (var i = directiveRecords.length - 1; i >= 0; --i) {
            var dir = directiveRecords[i];
            if (dir.callAfterViewInit) {
                res.push(`if(${this._names.getStateName()} ${eq} ${this._changeDetectorStateName}.NeverChecked) ${this._names.getDirectiveName(dir.directiveIndex)}.ngAfterViewInit();`);
            }
            if (dir.callAfterViewChecked) {
                res.push(`${this._names.getDirectiveName(dir.directiveIndex)}.ngAfterViewChecked();`);
            }
        }
        return res;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZWdlbl9sb2dpY191dGlsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYW5ndWxhcjIvc3JjL2NvcmUvY2hhbmdlX2RldGVjdGlvbi9jb2RlZ2VuX2xvZ2ljX3V0aWwudHMiXSwibmFtZXMiOlsiQ29kZWdlbkxvZ2ljVXRpbCIsIkNvZGVnZW5Mb2dpY1V0aWwuY29uc3RydWN0b3IiLCJDb2RlZ2VuTG9naWNVdGlsLmdlblByb3BlcnR5QmluZGluZ0V2YWxWYWx1ZSIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuRXZlbnRCaW5kaW5nRXZhbFZhbHVlIiwiQ29kZWdlbkxvZ2ljVXRpbC5fZ2VuRXZhbFZhbHVlIiwiQ29kZWdlbkxvZ2ljVXRpbC5fb2JzZXJ2ZSIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuUHJvcGVydHlCaW5kaW5nVGFyZ2V0cyIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuRGlyZWN0aXZlSW5kaWNlcyIsIkNvZGVnZW5Mb2dpY1V0aWwuX2dlbkludGVycG9sYXRpb24iLCJDb2RlZ2VuTG9naWNVdGlsLmdlbkh5ZHJhdGVEaXJlY3RpdmVzIiwiQ29kZWdlbkxvZ2ljVXRpbC5nZW5EaXJlY3RpdmVzT25EZXN0cm95IiwiQ29kZWdlbkxvZ2ljVXRpbC5fZ2VuRXZlbnRIYW5kbGVyIiwiQ29kZWdlbkxvZ2ljVXRpbC5fZ2VuUmVhZERpcmVjdGl2ZSIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuSHlkcmF0ZURldGVjdG9ycyIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuQ29udGVudExpZmVjeWNsZUNhbGxiYWNrcyIsIkNvZGVnZW5Mb2dpY1V0aWwuZ2VuVmlld0xpZmVjeWNsZUNhbGxiYWNrcyJdLCJtYXBwaW5ncyI6Ik9BQU8sRUFBQyxPQUFPLEVBQXVCLFNBQVMsRUFBRSxPQUFPLEVBQUMsTUFBTSwwQkFBMEI7T0FFbEYsRUFBQyxNQUFNLEVBQUUsdUJBQXVCLEVBQUUsU0FBUyxFQUFDLE1BQU0sa0JBQWtCO09BQ3BFLEVBQWMsVUFBVSxFQUFDLE1BQU0sZ0JB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Q0FBQ0E7QUFDSGYsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7SVNfREFSVCwgSnNvbiwgU3RyaW5nV3JhcHBlciwgaXNQcmVzZW50LCBpc0JsYW5rfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2xhbmcnO1xuaW1wb3J0IHtDb2RlZ2VuTmFtZVV0aWx9IGZyb20gJy4vY29kZWdlbl9uYW1lX3V0aWwnO1xuaW1wb3J0IHtjb2RpZnksIGNvbWJpbmVHZW5lcmF0ZWRTdHJpbmdzLCByYXdTdHJpbmd9IGZyb20gJy4vY29kZWdlbl9mYWNhZGUnO1xuaW1wb3J0IHtQcm90b1JlY29yZCwgUmVjb3JkVHlwZX0gZnJvbSAnLi9wcm90b19yZWNvcmQnO1xuaW1wb3J0IHtCaW5kaW5nVGFyZ2V0fSBmcm9tICcuL2JpbmRpbmdfcmVjb3JkJztcbmltcG9ydCB7RGlyZWN0aXZlUmVjb3JkfSBmcm9tICcuL2RpcmVjdGl2ZV9yZWNvcmQnO1xuaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneX0gZnJvbSAnLi9jb25zdGFudHMnO1xuaW1wb3J0IHtCYXNlRXhjZXB0aW9ufSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2V4Y2VwdGlvbnMnO1xuXG4vKipcbiAqIENsYXNzIHJlc3BvbnNpYmxlIGZvciBwcm92aWRpbmcgY2hhbmdlIGRldGVjdGlvbiBsb2dpYyBmb3IgY2hhbmdlIGRldGVjdG9yIGNsYXNzZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBDb2RlZ2VuTG9naWNVdGlsIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBfbmFtZXM6IENvZGVnZW5OYW1lVXRpbCwgcHJpdmF0ZSBfdXRpbE5hbWU6IHN0cmluZyxcbiAgICAgICAgICAgICAgcHJpdmF0ZSBfY2hhbmdlRGV0ZWN0b3JTdGF0ZU5hbWU6IHN0cmluZyxcbiAgICAgICAgICAgICAgcHJpdmF0ZSBfY2hhbmdlRGV0ZWN0aW9uOiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSkge31cblxuICAvKipcbiAgICogR2VuZXJhdGVzIGEgc3RhdGVtZW50IHdoaWNoIHVwZGF0ZXMgdGhlIGxvY2FsIHZhcmlhYmxlIHJlcHJlc2VudGluZyBgcHJvdG9SZWNgIHdpdGggdGhlIGN1cnJlbnRcbiAgICogdmFsdWUgb2YgdGhlIHJlY29yZC4gVXNlZCBieSBwcm9wZXJ0eSBiaW5kaW5ncy5cbiAgICovXG4gIGdlblByb3BlcnR5QmluZGluZ0V2YWxWYWx1ZShwcm90b1JlYzogUHJvdG9SZWNvcmQpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9nZW5FdmFsVmFsdWUocHJvdG9SZWMsIGlkeCA9PiB0aGlzLl9uYW1lcy5nZXRMb2NhbE5hbWUoaWR4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX25hbWVzLmdldExvY2Fsc0FjY2Vzc29yTmFtZSgpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZXMgYSBzdGF0ZW1lbnQgd2hpY2ggdXBkYXRlcyB0aGUgbG9jYWwgdmFyaWFibGUgcmVwcmVzZW50aW5nIGBwcm90b1JlY2Agd2l0aCB0aGUgY3VycmVudFxuICAgKiB2YWx1ZSBvZiB0aGUgcmVjb3JkLiBVc2VkIGJ5IGV2ZW50IGJpbmRpbmdzLlxuICAgKi9cbiAgZ2VuRXZlbnRCaW5kaW5nRXZhbFZhbHVlKGV2ZW50UmVjb3JkOiBhbnksIHByb3RvUmVjOiBQcm90b1JlY29yZCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX2dlbkV2YWxWYWx1ZShwcm90b1JlYywgaWR4ID0+IHRoaXMuX25hbWVzLmdldEV2ZW50TG9jYWxOYW1lKGV2ZW50UmVjb3JkLCBpZHgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsb2NhbHNcIik7XG4gIH1cblxuICBwcml2YXRlIF9nZW5FdmFsVmFsdWUocHJvdG9SZWM6IFByb3RvUmVjb3JkLCBnZXRMb2NhbE5hbWU6IEZ1bmN0aW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgbG9jYWxzQWNjZXNzb3I6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgdmFyIGNvbnRleHQgPSAocHJvdG9SZWMuY29udGV4dEluZGV4ID09IC0xKSA/XG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbmFtZXMuZ2V0RGlyZWN0aXZlTmFtZShwcm90b1JlYy5kaXJlY3RpdmVJbmRleCkgOlxuICAgICAgICAgICAgICAgICAgICAgIGdldExvY2FsTmFtZShwcm90b1JlYy5jb250ZXh0SW5kZXgpO1xuICAgIHZhciBhcmdTdHJpbmcgPSBwcm90b1JlYy5hcmdzLm1hcChhcmcgPT4gZ2V0TG9jYWxOYW1lKGFyZykpLmpvaW4oXCIsIFwiKTtcblxuICAgIHZhciByaHM6IHN0cmluZztcbiAgICBzd2l0Y2ggKHByb3RvUmVjLm1vZGUpIHtcbiAgICAgIGNhc2UgUmVjb3JkVHlwZS5TZWxmOlxuICAgICAgICByaHMgPSBjb250ZXh0O1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBSZWNvcmRUeXBlLkNvbnN0OlxuICAgICAgICByaHMgPSBjb2RpZnkocHJvdG9SZWMuZnVuY09yVmFsdWUpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBSZWNvcmRUeXBlLlByb3BlcnR5UmVhZDpcbiAgICAgICAgcmhzID0gdGhpcy5fb2JzZXJ2ZShgJHtjb250ZXh0fS4ke3Byb3RvUmVjLm5hbWV9YCwgcHJvdG9SZWMpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBSZWNvcmRUeXBlLlNhZmVQcm9wZXJ0eTpcbiAgICAgICAgdmFyIHJlYWQgPSB0aGlzLl9vYnNlcnZlKGAke2NvbnRleHR9LiR7cHJvdG9SZWMubmFtZX1gLCBwcm90b1JlYyk7XG4gICAgICAgIHJocyA9XG4gICAgICAgICAgICBgJHt0aGlzLl91dGlsTmFtZX0uaXNWYWx1ZUJsYW5rKCR7Y29udGV4dH0pID8gbnVsbCA6ICR7dGhpcy5fb2JzZXJ2ZShyZWFkLCBwcm90b1JlYyl9YDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgUmVjb3JkVHlwZS5Qcm9wZXJ0eVdyaXRlOlxuICAgICAgICByaHMgPSBgJHtjb250ZXh0fS4ke3Byb3RvUmVjLm5hbWV9ID0gJHtnZXRMb2NhbE5hbWUocHJvdG9SZWMuYXJnc1swXSl9YDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgUmVjb3JkVHlwZS5Mb2NhbDpcbiAgICAgICAgcmhzID0gdGhpcy5fb2JzZXJ2ZShgJHtsb2NhbHNBY2Nlc3Nvcn0uZ2V0KCR7cmF3U3RyaW5nKHByb3RvUmVjLm5hbWUpfSlgLCBwcm90b1JlYyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuSW52b2tlTWV0aG9kOlxuICAgICAgICByaHMgPSB0aGlzLl9vYnNlcnZlKGAke2NvbnRleHR9LiR7cHJvdG9SZWMubmFtZX0oJHthcmdTdHJpbmd9KWAsIHByb3RvUmVjKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgUmVjb3JkVHlwZS5TYWZlTWV0aG9kSW52b2tlOlxuICAgICAgICB2YXIgaW52b2tlID0gYCR7Y29udGV4dH0uJHtwcm90b1JlYy5uYW1lfSgke2FyZ1N0cmluZ30pYDtcbiAgICAgICAgcmhzID1cbiAgICAgICAgICAgIGAke3RoaXMuX3V0aWxOYW1lfS5pc1ZhbHVlQmxhbmsoJHtjb250ZXh0fSkgPyBudWxsIDogJHt0aGlzLl9vYnNlcnZlKGludm9rZSwgcHJvdG9SZWMpfWA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuSW52b2tlQ2xvc3VyZTpcbiAgICAgICAgcmhzID0gYCR7Y29udGV4dH0oJHthcmdTdHJpbmd9KWA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuUHJpbWl0aXZlT3A6XG4gICAgICAgIHJocyA9IGAke3RoaXMuX3V0aWxOYW1lfS4ke3Byb3RvUmVjLm5hbWV9KCR7YXJnU3RyaW5nfSlgO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBSZWNvcmRUeXBlLkNvbGxlY3Rpb25MaXRlcmFsOlxuICAgICAgICByaHMgPSBgJHt0aGlzLl91dGlsTmFtZX0uJHtwcm90b1JlYy5uYW1lfSgke2FyZ1N0cmluZ30pYDtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgUmVjb3JkVHlwZS5JbnRlcnBvbGF0ZTpcbiAgICAgICAgcmhzID0gdGhpcy5fZ2VuSW50ZXJwb2xhdGlvbihwcm90b1JlYyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuS2V5ZWRSZWFkOlxuICAgICAgICByaHMgPSB0aGlzLl9vYnNlcnZlKGAke2NvbnRleHR9WyR7Z2V0TG9jYWxOYW1lKHByb3RvUmVjLmFyZ3NbMF0pfV1gLCBwcm90b1JlYyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuS2V5ZWRXcml0ZTpcbiAgICAgICAgcmhzID0gYCR7Y29udGV4dH1bJHtnZXRMb2NhbE5hbWUocHJvdG9SZWMuYXJnc1swXSl9XSA9ICR7Z2V0TG9jYWxOYW1lKHByb3RvUmVjLmFyZ3NbMV0pfWA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFJlY29yZFR5cGUuQ2hhaW46XG4gICAgICAgIHJocyA9IGAke2dldExvY2FsTmFtZShwcm90b1JlYy5hcmdzW3Byb3RvUmVjLmFyZ3MubGVuZ3RoIC0gMV0pfWA7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgQmFzZUV4Y2VwdGlvbihgVW5rbm93biBvcGVyYXRpb24gJHtwcm90b1JlYy5tb2RlfWApO1xuICAgIH1cbiAgICByZXR1cm4gYCR7Z2V0TG9jYWxOYW1lKHByb3RvUmVjLnNlbGZJbmRleCl9ID0gJHtyaHN9O2A7XG4gIH1cblxuICAvKiogQGludGVybmFsICovXG4gIF9vYnNlcnZlKGV4cDogc3RyaW5nLCByZWM6IFByb3RvUmVjb3JkKTogc3RyaW5nIHtcbiAgICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gICAgaWYgKHRoaXMuX2NoYW5nZURldGVjdGlvbiA9PT0gQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoT2JzZXJ2ZSkge1xuICAgICAgcmV0dXJuIGB0aGlzLm9ic2VydmVWYWx1ZSgke2V4cH0sICR7cmVjLnNlbGZJbmRleH0pYDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGV4cDtcbiAgICB9XG4gIH1cblxuICBnZW5Qcm9wZXJ0eUJpbmRpbmdUYXJnZXRzKHByb3BlcnR5QmluZGluZ1RhcmdldHM6IEJpbmRpbmdUYXJnZXRbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBnZW5EZWJ1Z0luZm86IGJvb2xlYW4pOiBzdHJpbmcge1xuICAgIHZhciBicyA9IHByb3BlcnR5QmluZGluZ1RhcmdldHMubWFwKGIgPT4ge1xuICAgICAgaWYgKGlzQmxhbmsoYikpIHJldHVybiBcIm51bGxcIjtcblxuICAgICAgdmFyIGRlYnVnID0gZ2VuRGVidWdJbmZvID8gY29kaWZ5KGIuZGVidWcpIDogXCJudWxsXCI7XG4gICAgICByZXR1cm4gYCR7dGhpcy5fdXRpbE5hbWV9LmJpbmRpbmdUYXJnZXQoJHtjb2RpZnkoYi5tb2RlKX0sICR7Yi5lbGVtZW50SW5kZXh9LCAke2NvZGlmeShiLm5hbWUpfSwgJHtjb2RpZnkoYi51bml0KX0sICR7ZGVidWd9KWA7XG4gICAgfSk7XG4gICAgcmV0dXJuIGBbJHticy5qb2luKFwiLCBcIil9XWA7XG4gIH1cblxuICBnZW5EaXJlY3RpdmVJbmRpY2VzKGRpcmVjdGl2ZVJlY29yZHM6IERpcmVjdGl2ZVJlY29yZFtdKTogc3RyaW5nIHtcbiAgICB2YXIgYnMgPSBkaXJlY3RpdmVSZWNvcmRzLm1hcChcbiAgICAgICAgYiA9PlxuICAgICAgICAgICAgYCR7dGhpcy5fdXRpbE5hbWV9LmRpcmVjdGl2ZUluZGV4KCR7Yi5kaXJlY3RpdmVJbmRleC5lbGVtZW50SW5kZXh9LCAke2IuZGlyZWN0aXZlSW5kZXguZGlyZWN0aXZlSW5kZXh9KWApO1xuICAgIHJldHVybiBgWyR7YnMuam9pbihcIiwgXCIpfV1gO1xuICB9XG5cbiAgLyoqIEBpbnRlcm5hbCAqL1xuICBfZ2VuSW50ZXJwb2xhdGlvbihwcm90b1JlYzogUHJvdG9SZWNvcmQpOiBzdHJpbmcge1xuICAgIHZhciBpVmFscyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcHJvdG9SZWMuYXJncy5sZW5ndGg7ICsraSkge1xuICAgICAgaVZhbHMucHVzaChjb2RpZnkocHJvdG9SZWMuZml4ZWRBcmdzW2ldKSk7XG4gICAgICBpVmFscy5wdXNoKGAke3RoaXMuX3V0aWxOYW1lfS5zKCR7dGhpcy5fbmFtZXMuZ2V0TG9jYWxOYW1lKHByb3RvUmVjLmFyZ3NbaV0pfSlgKTtcbiAgICB9XG4gICAgaVZhbHMucHVzaChjb2RpZnkocHJvdG9SZWMuZml4ZWRBcmdzW3Byb3RvUmVjLmFyZ3MubGVuZ3RoXSkpO1xuICAgIHJldHVybiBjb21iaW5lR2VuZXJhdGVkU3RyaW5ncyhpVmFscyk7XG4gIH1cblxuICBnZW5IeWRyYXRlRGlyZWN0aXZlcyhkaXJlY3RpdmVSZWNvcmRzOiBEaXJlY3RpdmVSZWNvcmRbXSk6IHN0cmluZyB7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIHZhciBvdXRwdXRDb3VudCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkaXJlY3RpdmVSZWNvcmRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgciA9IGRpcmVjdGl2ZVJlY29yZHNbaV07XG4gICAgICB2YXIgZGlyVmFyTmFtZSA9IHRoaXMuX25hbWVzLmdldERpcmVjdGl2ZU5hbWUoci5kaXJlY3RpdmVJbmRleCk7XG4gICAgICByZXMucHVzaChgJHtkaXJWYXJOYW1lfSA9ICR7dGhpcy5fZ2VuUmVhZERpcmVjdGl2ZShpKX07YCk7XG4gICAgICBpZiAoaXNQcmVzZW50KHIub3V0cHV0cykpIHtcbiAgICAgICAgci5vdXRwdXRzLmZvckVhY2gob3V0cHV0ID0+IHtcbiAgICAgICAgICB2YXIgZXZlbnRIYW5kbGVyRXhwciA9IHRoaXMuX2dlbkV2ZW50SGFuZGxlcihyLmRpcmVjdGl2ZUluZGV4LmVsZW1lbnRJbmRleCwgb3V0cHV0WzFdKTtcbiAgICAgICAgICB2YXIgc3RhdGVtZW50U3RhcnQgPVxuICAgICAgICAgICAgICBgdGhpcy5vdXRwdXRTdWJzY3JpcHRpb25zWyR7b3V0cHV0Q291bnQrK31dID0gJHtkaXJWYXJOYW1lfS4ke291dHB1dFswXX1gO1xuICAgICAgICAgIGlmIChJU19EQVJUKSB7XG4gICAgICAgICAgICByZXMucHVzaChgJHtzdGF0ZW1lbnRTdGFydH0ubGlzdGVuKCR7ZXZlbnRIYW5kbGVyRXhwcn0pO2ApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXMucHVzaChgJHtzdGF0ZW1lbnRTdGFydH0uc3Vic2NyaWJlKHtuZXh0OiAke2V2ZW50SGFuZGxlckV4cHJ9fSk7YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKG91dHB1dENvdW50ID4gMCkge1xuICAgICAgdmFyIHN0YXRlbWVudFN0YXJ0ID0gJ3RoaXMub3V0cHV0U3Vic2NyaXB0aW9ucyc7XG4gICAgICBpZiAoSVNfREFSVCkge1xuICAgICAgICByZXMudW5zaGlmdChgJHtzdGF0ZW1lbnRTdGFydH0gPSBuZXcgTGlzdCgke291dHB1dENvdW50fSk7YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMudW5zaGlmdChgJHtzdGF0ZW1lbnRTdGFydH0gPSBuZXcgQXJyYXkoJHtvdXRwdXRDb3VudH0pO2ApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzLmpvaW4oXCJcXG5cIik7XG4gIH1cblxuICBnZW5EaXJlY3RpdmVzT25EZXN0cm95KGRpcmVjdGl2ZVJlY29yZHM6IERpcmVjdGl2ZVJlY29yZFtdKTogc3RyaW5nIHtcbiAgICB2YXIgcmVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkaXJlY3RpdmVSZWNvcmRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgciA9IGRpcmVjdGl2ZVJlY29yZHNbaV07XG4gICAgICBpZiAoci5jYWxsT25EZXN0cm95KSB7XG4gICAgICAgIHZhciBkaXJWYXJOYW1lID0gdGhpcy5fbmFtZXMuZ2V0RGlyZWN0aXZlTmFtZShyLmRpcmVjdGl2ZUluZGV4KTtcbiAgICAgICAgcmVzLnB1c2goYCR7ZGlyVmFyTmFtZX0ubmdPbkRlc3Ryb3koKTtgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcy5qb2luKFwiXFxuXCIpO1xuICB9XG5cbiAgcHJpdmF0ZSBfZ2VuRXZlbnRIYW5kbGVyKGJvdW5kRWxlbWVudEluZGV4OiBudW1iZXIsIGV2ZW50TmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoSVNfREFSVCkge1xuICAgICAgcmV0dXJuIGAoZXZlbnQpID0+IHRoaXMuaGFuZGxlRXZlbnQoJyR7ZXZlbnROYW1lfScsICR7Ym91bmRFbGVtZW50SW5kZXh9LCBldmVudClgO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYChmdW5jdGlvbihldmVudCkgeyByZXR1cm4gdGhpcy5oYW5kbGVFdmVudCgnJHtldmVudE5hbWV9JywgJHtib3VuZEVsZW1lbnRJbmRleH0sIGV2ZW50KTsgfSkuYmluZCh0aGlzKWA7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfZ2VuUmVhZERpcmVjdGl2ZShpbmRleDogbnVtYmVyKSB7XG4gICAgdmFyIGRpcmVjdGl2ZUV4cHIgPSBgdGhpcy5nZXREaXJlY3RpdmVGb3IoZGlyZWN0aXZlcywgJHtpbmRleH0pYDtcbiAgICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gICAgaWYgKHRoaXMuX2NoYW5nZURldGVjdGlvbiA9PT0gQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoT2JzZXJ2ZSkge1xuICAgICAgcmV0dXJuIGB0aGlzLm9ic2VydmVEaXJlY3RpdmUoJHtkaXJlY3RpdmVFeHByfSwgJHtpbmRleH0pYDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGRpcmVjdGl2ZUV4cHI7XG4gICAgfVxuICB9XG5cbiAgZ2VuSHlkcmF0ZURldGVjdG9ycyhkaXJlY3RpdmVSZWNvcmRzOiBEaXJlY3RpdmVSZWNvcmRbXSk6IHN0cmluZyB7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGlyZWN0aXZlUmVjb3Jkcy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHIgPSBkaXJlY3RpdmVSZWNvcmRzW2ldO1xuICAgICAgaWYgKCFyLmlzRGVmYXVsdENoYW5nZURldGVjdGlvbigpKSB7XG4gICAgICAgIHJlcy5wdXNoKFxuICAgICAgICAgICAgYCR7dGhpcy5fbmFtZXMuZ2V0RGV0ZWN0b3JOYW1lKHIuZGlyZWN0aXZlSW5kZXgpfSA9IHRoaXMuZ2V0RGV0ZWN0b3JGb3IoZGlyZWN0aXZlcywgJHtpfSk7YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXMuam9pbihcIlxcblwiKTtcbiAgfVxuXG4gIGdlbkNvbnRlbnRMaWZlY3ljbGVDYWxsYmFja3MoZGlyZWN0aXZlUmVjb3JkczogRGlyZWN0aXZlUmVjb3JkW10pOiBzdHJpbmdbXSB7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIHZhciBlcSA9IElTX0RBUlQgPyAnPT0nIDogJz09PSc7XG4gICAgLy8gTk9URShrZWdsdW5lcSk6IE9yZGVyIGlzIGltcG9ydGFudCFcbiAgICBmb3IgKHZhciBpID0gZGlyZWN0aXZlUmVjb3Jkcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgdmFyIGRpciA9IGRpcmVjdGl2ZVJlY29yZHNbaV07XG4gICAgICBpZiAoZGlyLmNhbGxBZnRlckNvbnRlbnRJbml0KSB7XG4gICAgICAgIHJlcy5wdXNoKFxuICAgICAgICAgICAgYGlmKCR7dGhpcy5fbmFtZXMuZ2V0U3RhdGVOYW1lKCl9ICR7ZXF9ICR7dGhpcy5fY2hhbmdlRGV0ZWN0b3JTdGF0ZU5hbWV9Lk5ldmVyQ2hlY2tlZCkgJHt0aGlzLl9uYW1lcy5nZXREaXJlY3RpdmVOYW1lKGRpci5kaXJlY3RpdmVJbmRleCl9Lm5nQWZ0ZXJDb250ZW50SW5pdCgpO2ApO1xuICAgICAgfVxuXG4gICAgICBpZiAoZGlyLmNhbGxBZnRlckNvbnRlbnRDaGVja2VkKSB7XG4gICAgICAgIHJlcy5wdXNoKGAke3RoaXMuX25hbWVzLmdldERpcmVjdGl2ZU5hbWUoZGlyLmRpcmVjdGl2ZUluZGV4KX0ubmdBZnRlckNvbnRlbnRDaGVja2VkKCk7YCk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG4gIH1cblxuICBnZW5WaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzKGRpcmVjdGl2ZVJlY29yZHM6IERpcmVjdGl2ZVJlY29yZFtdKTogc3RyaW5nW10ge1xuICAgIHZhciByZXMgPSBbXTtcbiAgICB2YXIgZXEgPSBJU19EQVJUID8gJz09JyA6ICc9PT0nO1xuICAgIC8vIE5PVEUoa2VnbHVuZXEpOiBPcmRlciBpcyBpbXBvcnRhbnQhXG4gICAgZm9yICh2YXIgaSA9IGRpcmVjdGl2ZVJlY29yZHMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgIHZhciBkaXIgPSBkaXJlY3RpdmVSZWNvcmRzW2ldO1xuICAgICAgaWYgKGRpci5jYWxsQWZ0ZXJWaWV3SW5pdCkge1xuICAgICAgICByZXMucHVzaChcbiAgICAgICAgICAgIGBpZigke3RoaXMuX25hbWVzLmdldFN0YXRlTmFtZSgpfSAke2VxfSAke3RoaXMuX2NoYW5nZURldGVjdG9yU3RhdGVOYW1lfS5OZXZlckNoZWNrZWQpICR7dGhpcy5fbmFtZXMuZ2V0RGlyZWN0aXZlTmFtZShkaXIuZGlyZWN0aXZlSW5kZXgpfS5uZ0FmdGVyVmlld0luaXQoKTtgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGRpci5jYWxsQWZ0ZXJWaWV3Q2hlY2tlZCkge1xuICAgICAgICByZXMucHVzaChgJHt0aGlzLl9uYW1lcy5nZXREaXJlY3RpdmVOYW1lKGRpci5kaXJlY3RpdmVJbmRleCl9Lm5nQWZ0ZXJWaWV3Q2hlY2tlZCgpO2ApO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xuICB9XG59XG4iXX0=