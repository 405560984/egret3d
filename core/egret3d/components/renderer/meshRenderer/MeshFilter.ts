namespace egret3d {
    /**
     * 网格过滤组件。
     * - 为网格渲染组件提供网格资源。
     */
    export class MeshFilter extends paper.BaseComponent {
        /**
         * 当网格过滤组件的网格资源改变时派发事件。
         */
        public static readonly onMeshChanged: signals.Signal<MeshFilter> = new signals.Signal();

        private _mesh: Mesh | null = null;
        /**
         * @internal
         */
        public uninitialize() {
            if (this._mesh !== null) {
                this._mesh.release();
            }

            super.uninitialize();

            this._mesh = null;
        }
        /**
         * 该组件的网格资源。
         */
        @paper.editor.property(paper.editor.EditType.MESH)
        @paper.serializedField("_mesh")
        public get mesh(): Mesh | null {
            return this._mesh;
        }
        public set mesh(value: Mesh | null) {
            if (this._mesh === value) {
                return;
            }

            if (this._mesh !== null) {
                this._mesh.release();
            }

            if (value !== null) {
                value.retain();
            }

            this._mesh = value;

            MeshFilter.onMeshChanged.dispatch(this);
        }
    }
}
