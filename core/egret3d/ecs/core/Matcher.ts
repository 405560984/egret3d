namespace paper {

    const _components: IComponentClass<IComponent>[] = [];
    /**
     * 组件匹配器。
     */
    export class Matcher<TEntity extends IEntity> implements IAllOfMatcher<TEntity>  {
        /**
         * 
         * @param components 
         */
        public static create<TEntity extends IEntity>(...components: IComponentClass<IComponent>[]): IAllOfMatcher<TEntity>;
        /**
         * 
         * @param componentEnabledFilter 
         * @param components 
         */
        public static create<TEntity extends IEntity>(componentEnabledFilter: false, ...components: IComponentClass<IComponent>[]): IAllOfMatcher<TEntity>;
        public static create<TEntity extends IEntity>(...args: any[]): IAllOfMatcher<TEntity> {
            const matcher = new Matcher<TEntity>(args[0] !== false);

            if (!matcher.componentEnabledFilter) {
                args.shift();
            }

            matcher._distinct(args, matcher._allOfComponents);

            return matcher;
        }

        public readonly componentEnabledFilter: boolean = true;

        private _id: string = "";
        private readonly _components: IComponentClass<IComponent>[] = [];
        private readonly _allOfComponents: IComponentClass<IComponent>[] = [];
        private readonly _anyOfComponents: IComponentClass<IComponent>[] = [];
        private readonly _noneOfComponents: IComponentClass<IComponent>[] = [];
        private readonly _extraOfComponents: IComponentClass<IComponent>[] = [];

        private constructor(componentEnabledFilter: boolean) {
            this.componentEnabledFilter = componentEnabledFilter;
        }

        private _sortComponents(a: IComponentClass<IComponent>, b: IComponentClass<IComponent>) {
            return a.componentIndex - b.componentIndex;
        }

        private _distinct(source: ReadonlyArray<IComponentClass<IComponent>>, target: IComponentClass<IComponent>[]) {
            if (source.length === 0) {
                return;
            }

            let index = 0;

            for (const component of source) {
                registerClass(component); // TODO

                if (target.indexOf(component) < 0) {
                    target[index++] = component;
                }
            }

            if (target.length !== index) {
                target.length = index;
            }

            target.sort(this._sortComponents);
        }

        private _merge() {
            if (this._allOfComponents.length > 0) {
                for (const component of this._allOfComponents) {
                    _components.push(component);
                }
            }

            if (this._anyOfComponents.length > 0) {
                for (const component of this._anyOfComponents) {
                    _components.push(component);
                }
            }

            if (this._noneOfComponents.length > 0) {
                for (const component of this._noneOfComponents) {
                    _components.push(component);
                }
            }

            if (this._extraOfComponents.length > 0) {
                for (const component of this._extraOfComponents) {
                    _components.push(component);
                }
            }

            this._distinct(_components, this._components);

            if (_components.length > 0) {
                _components.length = 0;
            }
        }

        public anyOf(...components: IComponentClass<IComponent>[]): IAnyOfMatcher<TEntity> {
            if (this._id) {
                return this;
            }

            this._distinct(components, this._anyOfComponents);

            return this;
        }

        public noneOf(...components: IComponentClass<IComponent>[]): INoneOfMatcher<TEntity> {
            if (this._id) {
                return this;
            }

            this._distinct(components, this._noneOfComponents);

            return this;
        }

        public extraOf(...components: IComponentClass<IComponent>[]): INoneOfMatcher<TEntity> {
            if (this._id) {
                return this;
            }

            this._distinct(components, this._extraOfComponents);

            return this;
        }

        public matches(entity: TEntity): boolean {
            return (this._allOfComponents.length === 0 || entity.hasComponents(this._allOfComponents))
                && (this._anyOfComponents.length === 0 || entity.hasAnyComponents(this._anyOfComponents))
                && (this._noneOfComponents.length === 0 || !entity.hasAnyComponents(this._noneOfComponents));
        }

        public matchesExtra(component: IComponentClass<IComponent>): boolean {
            return this._extraOfComponents.length > 0 && this._extraOfComponents.indexOf(component) >= 0;
        }

        public get id(): string {
            if (!this._id) {
                this._merge();

                const indices = [] as uint[];
                for (const component of this._components) {
                    indices.push(component.componentIndex);
                }

                this._id = (this.componentEnabledFilter ? "E" : "") + indices.join(",");
            }

            return this._id;
        }

        public get components(): ReadonlyArray<IComponentClass<IComponent>> {
            return this._components;
        }

        public get allOfComponents(): ReadonlyArray<IComponentClass<IComponent>> {
            return this._allOfComponents;
        }

        public get anyOfComponents(): ReadonlyArray<IComponentClass<IComponent>> {
            return this._anyOfComponents;
        }

        public get noneOfComponents(): ReadonlyArray<IComponentClass<IComponent>> {
            return this._noneOfComponents;
        }

        public get extraOfComponents(): ReadonlyArray<IComponentClass<IComponent>> {
            return this._extraOfComponents;
        }
    }
}
