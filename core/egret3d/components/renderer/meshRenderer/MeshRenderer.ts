namespace egret3d {
    /**
     * 网格渲染组件。
     * - 用于渲染网格筛选组件提供的网格资源。
     */
    export class MeshRenderer extends paper.BaseRenderer {
        protected _lightmapIndex: number = -1;
        /**
         * 如果该属性合并到 UV2 中，会破坏网格共享，共享的网格无法拥有不同的 lightmap UV。
         */
        @paper.serializedField
        protected readonly _lightmapScaleOffset: Vector4 = Vector4.create();
        /**
         * @private
         */
        public recalculateLocalBox() {
            const meshFilter = this.entity.getComponent(MeshFilter);
            this._localBoundingBox.clear();

            if (meshFilter && meshFilter.mesh && !meshFilter.mesh.isDisposed) {
                const vertices = meshFilter.mesh.getVertices()!;
                const position = helpVector3A;

                for (let i = 0, l = vertices.length; i < l; i += 3) {
                    position.set(vertices[i], vertices[i + 1], vertices[i + 2]);
                    this._localBoundingBox.add(position);
                }
            }
        }
        /**
         * 实时获取网格资源的指定三角形顶点位置。
         * @param triangleIndex 三角形索引。
         * @param out 
         */
        public getTriangle(triangleIndex: uint, out?: Triangle): Triangle {
            if (!out) {
                out = Triangle.create();
            }

            const transform = this.entity.getComponent(Transform);
            const meshFilter = this.entity.getComponent(MeshFilter);

            if (transform && meshFilter && meshFilter.mesh && !meshFilter.mesh.isDisposed) {
                const localToWorldMatrix = transform.localToWorldMatrix;
                meshFilter.mesh.getTriangle(triangleIndex, out);
                out.a.applyMatrix(localToWorldMatrix);
                out.b.applyMatrix(localToWorldMatrix);
                out.c.applyMatrix(localToWorldMatrix);
            }

            return out;
        }

        public raycast(ray: Readonly<Ray>, raycastInfo: RaycastInfo | null = null) {
            const transform = this.entity.getComponent(Transform);
            const meshFilter = this.entity.getComponent(MeshFilter);

            if (transform && meshFilter && meshFilter.enabled && meshFilter.mesh && !meshFilter.mesh.isDisposed) {
                const worldToLocalMatrix = transform.worldToLocalMatrix;
                const localRay = helpRay.applyMatrix(worldToLocalMatrix, ray);
                const localBoundingBox = this.localBoundingBox;

                if (localBoundingBox.raycast(localRay) && meshFilter.mesh.raycast(localRay, raycastInfo)) {
                    if (raycastInfo) { // Update local raycast info to world.
                        const localToWorldMatrix = transform.localToWorldMatrix;
                        raycastInfo.distance = ray.origin.getDistance(raycastInfo.position.applyMatrix(localToWorldMatrix));
                        raycastInfo.transform = transform;

                        const normal = raycastInfo.normal;
                        if (normal) {
                            // normal.applyDirection(localToWorldMatrix);
                            normal.applyMatrix3(helpMatrix3A.fromMatrix4(worldToLocalMatrix).transpose()).normalize();
                        }
                    }

                    return true;
                }
            }

            return false;
        }
        /**
         * 该组件的光照图索引。
         */
        @paper.editor.property(paper.editor.EditType.INT, { minimum: -1 })
        @paper.serializedField("_lightmapIndex")
        public get lightmapIndex(): int {
            return this._lightmapIndex;
        }
        public set lightmapIndex(value: int) {
            if (value === this._lightmapIndex) {
                return;
            }

            this._lightmapIndex = value;
        }
        /**
         * TODO
         */
        public get lightmapScaleOffset(): Readonly<Vector4> {
            return this._lightmapScaleOffset;
        }
    }
}
