namespace paper {
    /**
     * 基础变换组件。
     * - 实现实体之间的父子关系。
     */
    export abstract class BaseTransform extends BaseComponent {
        /**
         * @internal
         */
        public static readonly isAbstract: IComponentClass<IComponent> = BaseTransform as any;

        private _globalEnabled: boolean = false;
        private _globalEnabledDirty: boolean = true;
        protected readonly _children: this[] = [];
        protected _parent: this | null = null;
        /**
         * @internal
         */
        public _destroy() {
            super._destroy();

            for (const child of this._children) {
                child.entity.destroy();
            }

            this._children.length > 0 && (this._children.length = 0);
            this._parent = null;
        }
        /**
         * @internal
         */
        public _addChild(child: this) {
            const children = this._children;
            child._parent = this;

            if (children.indexOf(child) < 0) {
                children.push(child);

                return true;
            }

            return false;
        }
        /**
         * @internal
         */
        public _removeChild(child: this) {
            const children = this._children;
            const index = children.indexOf(child);
            child._parent = null;

            if (index >= 0) {
                children.splice(index, 1);

                return true;
            }

            return false;
        }

        protected abstract _onChangeParent(isBefore: boolean, worldTransformStays: boolean): void;

        public dispatchEnabledEvent(enabled: boolean): void {
            this._globalEnabledDirty = true;

            for (const child of this._children) {
                if (child.entity.enabled) {
                    for (const component of child.gameObject.components) {
                        if (component.enabled) {
                            component.dispatchEnabledEvent(enabled);
                        }
                    }
                }
            }

            super.dispatchEnabledEvent(enabled);
        }
        /**
         * 更改该组件的父级变换组件。
         * @param parent 父级变换组件。
         * @param worldTransformStays 是否保留当前世界空间变换。
         */
        public setParent(parent: this | null, worldTransformStays: boolean = false) {
            if (this.entity === paper.SceneManager.getInstance().globalEntity) {
                return this;
            }

            const prevParent = this._parent;

            if (prevParent === parent) {
                return this;
            }

            if (
                parent &&
                this.entity.scene !== parent.entity.scene
            ) {
                console.warn("Cannot change the parent to a different scene.");
                return this;
            }

            if (this === parent || (parent && this.contains(parent))) {
                console.error("Set the parent error.");
                return this;
            }

            this._onChangeParent(true, worldTransformStays);

            const prevEnabled = this.isActiveAndEnabled;

            if (prevParent) {
                prevParent._removeChild(this);
            }

            if (parent) {
                parent._addChild(this);
            }

            this._globalEnabledDirty = true;
            const currentEnabled = this.isActiveAndEnabled;

            if (prevEnabled !== currentEnabled) {
                this.dispatchEnabledEvent(currentEnabled);
            }

            this._onChangeParent(false, worldTransformStays);

            return this;
        }
        /**
         * 销毁该组件所有子（孙）级变换组件。
         */
        public destroyChildren(): void {
            const children = this._children;
            let i = children.length;

            while (i--) {
                children[i].entity.destroy();
            }
        }
        /**
         * 
         */
        public getChildren(out: this[] | { [key: string]: BaseTransform | (BaseTransform[]) } = [], depth: uint = 0) {
            for (const child of this._children) {
                if (Array.isArray(out)) {
                    out.push(child);
                }
                else {
                    const childName = child.entity.name;

                    if (childName in out) {
                        const transformOrTransforms = out[childName];

                        if (Array.isArray(transformOrTransforms)) {
                            transformOrTransforms.push(child as any);
                        }
                        else {
                            out[childName] = [transformOrTransforms, child as any];
                        }
                    }
                    else {
                        out[childName] = child as any;
                    }
                }

                if (depth !== 1) {
                    child.getChildren(out, depth > 0 ? depth - 1 : 0);
                }
            }

            return out;
        }
        /**
         * 
         */
        public getChildIndex(value: this): int {
            if (value._parent === this) {
                return this._children.indexOf(value);
            }

            return -1;
        }
        /**
         * 
         */
        public setChildIndex(value: this, index: uint): boolean {
            if (value._parent === this) {
                const children = this._children;
                const prevIndex = children.indexOf(value);

                if (prevIndex !== index) {
                    children.splice(prevIndex, 1);
                    children.splice(index, 0, value);

                    return true;
                }
            }

            return false;
        }
        /**
         * 
         */
        public getChildAt(index: uint): this | null {
            const children = this._children;

            return 0 <= index && index < children.length ? children[index] : null;
        }
        /**
         * 通过指定的名称或路径获取该组件的子（孙）级变换组件。
         * @param nameOrPath 名称或路径。
         */
        public find(nameOrPath: string): this | null {
            const names = nameOrPath.split("/");
            let ancestor = this;

            for (const name of names) {
                if (!name) {
                    return ancestor;
                }

                const prevAncestor = ancestor;

                for (const child of ancestor._children) {
                    if (child.entity.name === name) {
                        ancestor = child;
                        break;
                    }
                }

                if (prevAncestor === ancestor) {
                    return null;
                }
            }

            return ancestor;
        }
        /**
         * 该组件是否包含某个子（孙）级变换组件。
         */
        public contains(child: this): boolean {
            if (child === this) {
                return false;
            }

            let ancestor: this | null = child;

            while (ancestor !== this && ancestor !== null) {
                ancestor = ancestor._parent;
            }

            return ancestor === this;
        }

        public get isActiveAndEnabled(): boolean {
            if (this._globalEnabledDirty) {
                const parent = this._parent;

                if (!parent || parent.isActiveAndEnabled) {
                    this._globalEnabled = this._enabled;
                }
                else {
                    this._globalEnabled = false;
                }

                this._globalEnabledDirty = false;
            }

            return this._globalEnabled;
        }
        /**
         * 该组件的全部子级变换组件总数。（不包含孙级）
         */
        public get childCount(): uint {
            return this._children.length;
        }
        /**
         * 该组件实体的全部子级变换组件。（不包含孙级）
         */
        @paper.serializedField
        @paper.deserializedIgnore
        public get children(): ReadonlyArray<this> {
            return this._children;
        }
        /**
         * 该组件实体的父级变换组件。
         */
        public get parent(): this | null {
            return this._parent;
        }
        public set parent(value: this | null) {
            this.setParent(value, false);
        }
    }
}
