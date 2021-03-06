import { Type } from 'angular2/src/facade/lang';
import { DirectiveMetadata } from 'angular2/src/core/metadata';
export declare class DirectiveResolver {
    /**
     * Return {@link DirectiveMetadata} for a given `Type`.
     */
    resolve(type: Type): DirectiveMetadata;
    private _mergeWithPropertyMetadata(dm, propertyMetadata, directiveType);
    private _merge(dm, inputs, outputs, host, queries, directiveType);
}
export declare var CODEGEN_DIRECTIVE_RESOLVER: DirectiveResolver;
