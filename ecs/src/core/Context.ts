import * as signals from "signals";
import { IEntityClass, IComponentClass, IContext } from "../types";
import { filterArray } from "../Utility";
import Entity from "./Entity";
import Component from "./Component";
import Matcher from "./Matcher";
import Group from "./Group";
import Application from "../application/Application";
/**
 * 实体上下文。
 */
export default class Context<TEntity extends Entity> implements IContext<TEntity> {
    /**
     * @internal
     */
    public static create<TEntity extends Entity>(entityClass: IEntityClass<TEntity>, application: Application): Context<TEntity> {
        return new Context(entityClass, application);
    }
    /**
     * 当该上下文的实体添加到场景时派发事件。
     */
    public readonly onEntityAddedToScene: signals.Signal<Entity> = new signals.Signal();
    /**
     * 当该上下文的实体即将被销毁时派发事件。
     */
    public readonly onEntityDestroy: signals.Signal<Entity> = new signals.Signal();
    /**
     * 当该上下文的实体已经被销毁时派发事件。
     */
    public readonly onEntityDestroyed: signals.Signal<Entity> = new signals.Signal();
    /**
     * 当该上下文的实体添加组件时派发事件。
     */
    public readonly onComponentCreated: signals.Signal<[TEntity, Component]> = new signals.Signal();
    /**
     * 当该上下文的实体的组件被激活时派发事件。
     */
    public readonly onComponentEnabled: signals.Signal<[TEntity, Component]> = new signals.Signal();
    /**
     * 当该上下文的实体的组件被禁用时派发事件。
     */
    public readonly onComponentDisabled: signals.Signal<[TEntity, Component]> = new signals.Signal();
    /**
     * 当该上下文的实体的组件即将被销毁时派发事件。
     */
    public readonly onComponentDestroy: signals.Signal<[TEntity, Component]> = new signals.Signal();
    /**
     * 当该上下文的实体的组件已经被销毁时派发事件。
     */
    public readonly onComponentDestroyed: signals.Signal<[TEntity, Component]> = new signals.Signal();

    public readonly entityClass: IEntityClass<TEntity>;
    public readonly application: Application;

    private _entitiesDirty: boolean = false;
    private _entityCount: uint = 0;
    private readonly _entities: (Entity | null)[] = [];
    private readonly _componentsGroups: Group<TEntity>[][] = [];
    private readonly _componentsGroupsB: Group<TEntity>[][] = [];
    private readonly _groups: { [key: string]: Group<TEntity> } = {};

    private constructor(entityClass: IEntityClass<TEntity>, application: Application) {
        this.entityClass = entityClass;
        this.application = application;

        this.onComponentCreated.add(this._onComponentCreated, this);
        this.onComponentEnabled.add(this._onComponentEnabled, this);
        this.onComponentDisabled.add(this._onComponentDisabled, this);
        this.onComponentDestroyed.add(this._onComponentDestroyed, this);
    }

    private _onComponentCreated([entity, component]: [TEntity, Component]) {
        const componentClass = component.constructor as IComponentClass<Component>;
        const groups = this._componentsGroupsB[componentClass.componentIndex]; // TODO fixed component length.

        if (groups) {
            for (const group of groups) {
                group.handleEvent(entity, component, true);
            }
        }
    }

    private _onComponentEnabled([entity, component]: [TEntity, Component]) {
        const componentClass = component.constructor as IComponentClass<Component>;
        const groups = this._componentsGroups[componentClass.componentIndex]; // TODO fixed component length.

        if (groups) {
            for (const group of groups) {
                group.handleEvent(entity, component, true);
            }
        }
    }

    private _onComponentDisabled([entity, component]: [TEntity, Component]) {
        const componentClass = component.constructor as IComponentClass<Component>;
        const groups = this._componentsGroups[componentClass.componentIndex]; // TODO fixed component length.

        if (groups) {
            for (const group of groups) {
                group.handleEvent(entity, component, false);
            }
        }
    }

    private _onComponentDestroyed([entity, component]: [TEntity, Component]) {
        const componentClass = component.constructor as IComponentClass<Component>;
        const groups = this._componentsGroupsB[componentClass.componentIndex]; // TODO fixed component length.

        if (groups) {
            for (const group of groups) {
                group.handleEvent(entity, component, false);
            }
        }
    }
    /**
     * 通过实体组件匹配器获取该上下文中的一个实体组。
     * @param matcher 一个实体组件匹配器。
     */
    public getGroup(matcher: Matcher): Group<TEntity> {
        const { id } = matcher;
        const groups = this._groups;

        if (id in groups) {
            matcher.release();
        }
        else {
            const componentsGroups = matcher.componentEnabledFilter ? this._componentsGroups : this._componentsGroupsB;
            const group = Group.create(matcher, this.entities);
            groups[id] = group;

            for (const { componentIndex } of matcher.components) {
                if (!componentsGroups[componentIndex]) { // TODO fixed component length.
                    componentsGroups[componentIndex] = [];
                }

                componentsGroups[componentIndex].push(group);
            }
        }

        return groups[id];
    }
    /**
     * 创建一个该上下文的实体。
     * @param scene 实体被添加到的场景。
     * - 未设置则使用应用程序的激活场景。
     */
    public createEntity(): TEntity {
        const entities = this._entities;
        const entity = new this.entityClass();
        entity.initialize(this);
        entities[entities.length] = entity;
        this._entityCount++;
        this._entitiesDirty = true;

        return entity;
    }
    /**
     * 从该上下文中移除一个实体。
     * @param entity 要移除的实体。
     */
    public removeEntity(entity: TEntity): boolean {
        const entities = this._entities;
        const index = entities.indexOf(entity);

        if (index >= 0) {
            entities[index] = null;

            if (!entity.isDestroyed) {
                entity.destroy();
            }

            this._entityCount--;
            this._entitiesDirty = true;

            return true;
        }
        else if (DEBUG) {
            console.warn("The entity has been removed.");
        }

        return false;
    }

    public containsEntity(entity: TEntity): boolean {
        return this._entities.indexOf(entity) >= 0;
    }

    public get entityCount(): uint {
        return this._entityCount;
    }

    public get entities(): ReadonlyArray<TEntity> {
        const entities = this._entities;

        if (this._entitiesDirty) {
            filterArray(entities, null);
            this._entitiesDirty = false;
        }

        return entities as TEntity[];
    }
}
