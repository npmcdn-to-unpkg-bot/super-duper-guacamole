/**
 * @module
 * @description
 * The `di` module provides dependency injection container services.
 */
export { InjectMetadata, OptionalMetadata, InjectableMetadata, SelfMetadata, HostMetadata, SkipSelfMetadata, DependencyMetadata } from './di/metadata';
export * from './di/decorators';
export { forwardRef, resolveForwardRef, ForwardRefFn } from './di/forward_ref';
export { Injector } from './di/injector';
export { Binding, ProviderBuilder, ResolvedBinding, ResolvedFactory, Dependency, bind, Provider, ResolvedProvider, provide } from './di/provider';
export { Key, TypeLiteral } from './di/key';
export { NoProviderError, AbstractProviderError, CyclicDependencyError, InstantiationError, InvalidProviderError, NoAnnotationError, OutOfBoundsError } from './di/exceptions';
export { OpaqueToken } from './di/opaque_token';
