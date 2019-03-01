namespace paper {
    /**
     * 基础系统。
     * - 全部系统的基类。
     */
    export abstract class BaseSystem<TEntity extends IEntity> implements ISystem<TEntity> {
        /**
         * 
         */
        public static readonly executeMode: PlayerMode = PlayerMode.Player | PlayerMode.DebugPlayer | PlayerMode.Editor;
        /**
         * @internal
         */
        public static create<TEntity extends IEntity, TSystem extends ISystem<TEntity>>(systemClass: ISystemClass<TSystem, TEntity>, context: Context<TEntity>, order: SystemOrder): TSystem {
            return new systemClass(context, order);
        }

        public enabled: boolean = true;
        public readonly order: SystemOrder = -1;
        public readonly deltaTime: uint = 0;
        public readonly groups: ReadonlyArray<Group<TEntity>> = [];
        public readonly collectors: ReadonlyArray<Collector<TEntity>> = [];
        /**
         * @internal
         */
        public _lastEnabled: boolean = false;
        /**
         * @internal
         */
        public _executeEnabled: boolean = false;

        private _context: Context<TEntity> | null = null; // 兼容 interests 2.0 移除。
        /**
         * 禁止实例化系统。
         * @protected
         */
        public constructor(context: Context<TEntity>, order: SystemOrder = -1) {
            this.order = order;
            this._context = context;

            const matchers = this.getMatchers();
            const listeners = this.getListeners();

            if (matchers) {
                for (const matcher of matchers) {
                    this._addGroupAndCollector(matcher);
                }
            }

            if (listeners) {
                for (const config of listeners) {
                    config.type.add(config.listener, this);
                }
            }

            if (!(this as ISystem<TEntity>).onEntityAdded && this.onAddGameObject) {
                (this as ISystem<TEntity>).onEntityAdded = this.onAddGameObject;
            }

            if (!(this as ISystem<TEntity>).onEntityRemoved && this.onRemoveGameObject) {
                (this as ISystem<TEntity>).onEntityRemoved = this.onRemoveGameObject;
            }
        }

        private _addGroupAndCollector(matcher: ICompoundMatcher<TEntity>) {
            const group = this._context!.getGroup(matcher);
            (this.groups as Group<TEntity>[]).push(group);
            (this.collectors as Collector<TEntity>[]).push(Collector.create(group));
        }
        /**
         * @internal
         */
        public initialize(config?: any): void {
            (this as ISystem<TEntity>).onAwake && (this as ISystem<TEntity>).onAwake!(config);
        }
        /**
         * @internal
         */
        public uninitialize(): void {
        }
        /**
         * 获取该系统需要响应的组件匹配器。
         */
        protected getMatchers(): ICompoundMatcher<TEntity>[] | null {
            return null;
        }
        /**
         * 
         */
        protected getListeners(): { type: signals.Signal, listener: (component: any) => void }[] | null {
            return null;
        }

        public onAwake?(config?: any): void;
        public onEnable?(): void;
        public onStart?(): void;
        public onComponentRemoved?(component: IComponent, group: Group<TEntity>): void;
        public onEntityRemoved?(entity: TEntity, group: Group<TEntity>): void;
        public onEntityAdded?(entity: TEntity, group: Group<TEntity>): void;
        public onComponentAdded?(component: IComponent, group: Group<TEntity>): void;
        public onTick?(deltaTime?: number): void;
        public onTickCleanup?(deltaTime?: number): void;
        public onFrame?(deltaTime?: number): void;
        public onFrameCleanup?(deltaTime?: number): void;
        public onDisable?(): void;
        public onDestroy?(): void;

        /**
         * @deprecated
         */
        public readonly clock: Clock = clock;
        /**
         * @deprecated
         */
        public onAddGameObject?(entity: TEntity, group: Group<TEntity>): void;
        /**
         * @deprecated
         */
        public onRemoveGameObject?(entity: TEntity, group: Group<TEntity>): void;
        /**
         * @deprecated
         */
        public get interests(): ReadonlyArray<InterestConfig | ReadonlyArray<InterestConfig>> {
            return [];
        }
        public set interests(value: ReadonlyArray<InterestConfig | ReadonlyArray<InterestConfig>>) {
            if (value.length > 0) {
                let interests: ReadonlyArray<ReadonlyArray<InterestConfig>>;

                if (Array.isArray(value[0])) {
                    interests = value as ReadonlyArray<ReadonlyArray<InterestConfig>>;
                }
                else {
                    interests = [value as ReadonlyArray<InterestConfig>];
                }

                for (const interest of interests) {
                    const allOf = [];
                    const anyOf = [];
                    const noneOf = [];
                    const extraOf = [];

                    for (const config of interest) {
                        const isNoneOf = (config.type !== undefined) && (config.type & InterestType.Exculde) !== 0;
                        const isExtraOf = (config.type !== undefined) && (config.type & InterestType.Unessential) !== 0;

                        if (Array.isArray(config.componentClass)) {
                            for (const componentClass of config.componentClass) {
                                if (isNoneOf) {
                                    noneOf.push(componentClass);
                                }
                                else if (isExtraOf) {
                                    extraOf.push(componentClass);
                                }
                                else {
                                    anyOf.push(componentClass);
                                }
                            }
                        }
                        else if (isNoneOf) {
                            noneOf.push(config.componentClass);
                        }
                        else if (isExtraOf) {
                            extraOf.push(config.componentClass);
                        }
                        else {
                            allOf.push(config.componentClass);
                        }

                        if (config.listeners) {
                            for (const listenerConfig of config.listeners) {
                                listenerConfig.type.add(listenerConfig.listener, this);
                            }
                        }
                    }

                    const matcher = Matcher.create.apply(Matcher, allOf as any);
                    matcher.anyOf.apply(matcher, anyOf).noneOf.apply(matcher, noneOf).extraOf.apply(matcher, extraOf);
                    this._addGroupAndCollector(matcher);
                }
            }
        }
    }
}
