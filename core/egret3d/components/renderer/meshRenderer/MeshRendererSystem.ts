namespace egret3d {
    /**
     * 网格渲染组件系统。
     * - 为网格渲染组件生成绘制信息。
     */
    export class MeshRendererSystem extends paper.BaseSystem<paper.GameObject> {

        private readonly _drawCallCollecter: DrawCallCollecter = paper.Application.sceneManager.globalEntity.getComponent(DrawCallCollecter)!;
        private readonly _materialFilter: boolean[] = [];

        private _updateDrawCalls(entity: paper.GameObject, checkState: boolean) {
            if (checkState && (!this.enabled || !this.groups[0].containsEntity(entity))) {
                return;
            }

            const drawCallCollecter = this._drawCallCollecter;
            const { mesh } = entity.getComponent(MeshFilter)!;
            const renderer = entity.getComponent(MeshRenderer)!;
            const { materials } = renderer;
            const materialCount = materials.length;
            // Clear drawCalls.
            drawCallCollecter.removeDrawCalls(entity);

            if (mesh === null || materialCount === 0) {
                return;
            }

            const primitives = mesh.glTFMesh.primitives;
            const subMeshCount = primitives.length;

            if (DEBUG && subMeshCount === 0) {
                throw new Error();
            }

            const materialFilter = this._materialFilter;
            const { localToWorldMatrix } = entity.getComponent(Transform)!;

            if (materialFilter.length < materialCount) {
                materialFilter.length = materialCount;
            }

            for (let i = 0; i < subMeshCount; ++i) { // Specified materials.
                const materialIndex = primitives[i].material || 0;
                let material: Material | null = null;

                if (materialIndex < materialCount) {
                    material = materials[materialIndex];
                    materialFilter[materialIndex] = true;
                }

                if (material !== null) {
                    const drawCall = DrawCall.create();
                    drawCall.entity = entity;
                    drawCall.renderer = renderer;
                    drawCall.matrix = localToWorldMatrix;
                    drawCall.subMeshIndex = i;
                    drawCall.mesh = mesh;
                    drawCall.material = material;
                    drawCallCollecter.addDrawCall(drawCall);
                }
            }

            for (let i = 0; i < materialCount; ++i) { // No specified materials.
                if (materialFilter[i]) {
                    continue;
                }

                const material = materials[i]!;

                for (let j = 0; j < subMeshCount; ++j) {
                    const drawCall = DrawCall.create();
                    drawCall.entity = entity;
                    drawCall.renderer = renderer;
                    drawCall.matrix = localToWorldMatrix;
                    drawCall.subMeshIndex = j;
                    drawCall.mesh = mesh;
                    drawCall.material = material;
                    drawCallCollecter.addDrawCall(drawCall);
                }
            }
        }

        protected getMatchers() {
            return [
                paper.Matcher.create<paper.GameObject>(Transform, MeshFilter, MeshRenderer),
            ];
        }

        protected getListeners() {
            return [
                {
                    type: MeshFilter.onMeshChanged, listener: (component: paper.IComponent) => {
                        this._updateDrawCalls(component.entity as paper.GameObject, true);
                    }
                },
                {
                    type: MeshRenderer.onMaterialsChanged, listener: (component: paper.IComponent) => {
                        this._updateDrawCalls(component.entity as paper.GameObject, true);
                    }
                }
            ];
        }

        public onEntityAdded(entity: paper.GameObject) {
            this._updateDrawCalls(entity, false);
        }

        public onEntityRemoved(entity: paper.GameObject) {
            this._drawCallCollecter.removeDrawCalls(entity);
        }
    }
}
