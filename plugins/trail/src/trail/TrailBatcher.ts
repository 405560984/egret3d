/**
 * TODO: 
 * 
 * * 目前并未支持颜色参数, 因为渲染器还无法正常工作
 * * 支持除 `TrailTextureMode.stretch` 以外的 `TrailTextureMode`, 未完成
 * * 支持宽度曲线和颜色渐变以及相应的取样算法
 */
namespace egret3d.trail {
    // 为增加可读性添加的帮助函数

    function vec3() { return Vector3.create().release(); }
    /**
     * 获得两个向量相加的结果向量
     * @param a 
     * @param b 
     */
    function vec3Add(a: Vector3, b: Vector3): Vector3 { return vec3().add(a, b); }
    /**
     * 获得两个向量相减的结果向量
     * @param a 
     * @param b 
     */
    function vec3Substract(a: Vector3, b: Vector3): Vector3 { return vec3().subtract(a, b); }
    /**
     * 获得向量乘以一个标量的的结果向量
     * @param a 向量
     * @param b 标量
     */
    function vec3Mutiply(a: Vector3, b: float): Vector3 { return vec3().multiplyScalar(b, a); }
    /**
     * 获得两个向量叉乘的结果向量
     * @param a 
     * @param b 
     */
    function vec3Cross(a: Vector3, b: Vector3): Vector3 { return vec3().cross(a, b); }

    /**
     * 拖尾片段的数据结构
     * @internal
     */
    interface TrailSegment {
        /**
         * 结尾点的位置
         */
        position: Vector3;
        /**
         * 片段生成的时间戳
         */
        timeCreated: uint;
    }
    /**
     * 用 `TrailComponent` 数据生成对应用于绘制的 `Mesh` 数据
     * @internal
     */
    export class TrailBatcher {
        // 设置数据

        /**
         * 最大片段数
         * 假设存活 5 秒, 每秒 60 帧, 则最多在存活时间内生成 300 个片段
         */
        private _maxFragmentCount: uint = 5 * 60;
        /**
         * 对应的 TrailComponent
         */
        private _comp: TrailComponent;
        /**
         * 对应的 GameObject
         */
        private _gameObject: paper.GameObject;

        // 状态数据

        /**
         * 各个片段的数据
         */
        // 每个片段
        private _points: TrailSegment[] = [];
        /**
         * 上一次添加片段的位置
         */
        private _lastPosition: Vector3 | null;
        /**
         * 暂停时候的时间戳, 用于在恢复播放时计算时间差
         */
        private _pausedTime: uint = -1;
        /**
         * 定点, 每 3 个值对应一个顶点
         */
        private _verticles: float[] = [];
        /**
         * UV, 每 2 个值对应一个 uv
         */
        private _uvs: float[] = [];
        /**
         * 颜色, 每 4 个值对应一个颜色, 顺序为 rgba
         */
        private _colors: float[] = [];
        /**
         * 三角形对应的定点索引, 每 3 个值对应一个三角形
         */
        private _indices: uint[] = [];
        /**
         * 点和点之间的距离, 为了便于对齐, 第一个值为零
         */
        private _pointDistances: float[] = [0.0];
        /**
         * 点和点之间的距离的总和
         */
        private _distanceSum: float = 0;
        /**
         * 构成的 mesh 数据
         */
        private _mesh: Mesh | null;
        /**
         * 暂停
         */
        public pause(): void {
            this._pausedTime = paper.clock.timestamp();
        }
        /**
         * 初始化
         * @param comp 对应的 Trail 组件
         */
        public constructor(gameObject: paper.GameObject, comp: TrailComponent) {
            this._gameObject = gameObject;
            this._comp = comp;
            this._onPausedChanged = this._onPausedChanged.bind(this);
            this._onEmittingChanged = this._onEmittingChanged.bind(this);
        }

        public initialize() {
            this._comp.onPausedChanged.add(this._onPausedChanged);
            this._comp.onEmittingChanged.add(this._onEmittingChanged);
            this._createMesh();
        }
        public uninitialize() {
            this._comp.onPausedChanged.remove(this._onPausedChanged);
            this._comp.onEmittingChanged.remove(this._onEmittingChanged);
            this._releaseMesh();
        }
        /**
         * 对应的组件
         */
        public get gameObject(): paper.GameObject {
            return this._gameObject;
        }
        /**
         * 恢复
         */
        public resume(): void {
            if (this._pausedTime < 0) {
                console.warn("_pausedTime should not be less than 0 in TrailBatcher.resume()");
            }
            const frozenTime = paper.clock.timestamp() - this._pausedTime;
            for (const p of this._points) {
                p.timeCreated += frozenTime;
            }
        }
        /**
         * 每帧刷新
         * @param elapsedTime 此帧的时长(秒) (未使用此参数)
         */
        public update(elapsedTime: float) {
            if (!this._comp) { return; }
            const comp: TrailComponent = this._comp;

            // 暂停情况下不更新
            if (comp.paused) { return; }

            // 自动销毁
            if (!comp.emitting) {
                if (comp.autoDestruct && this._points.length < 2) {
                    comp.gameObject.destroy();
                    return;
                }
            }

            // 当前时间戳
            const now = paper.clock.timestamp();

            // 更新片段数据
            this._updateSegments(now);

            // 重新构建组成 mesh 的相关数据
            this._rebuildMeshData(now);

            // 更新 mesh
            this._composeMesh();
        }
        /**
         * 清理状态数据
         */
        public _reset() {
            this._points.length = 0;
            this._lastPosition = null;
            this._pausedTime = -1;
            this._distanceSum = 0;
            this._pointDistances.length = 1;

            this._resetMeshData();
        }
        /**
         * 更新片段数据
         * @param now 当前时间戳
         */
        private _updateSegments(now: float) {
            const comp = this._comp;
            if (comp.paused) { return; }

            const curPosition = comp.transform.position;

            // 如果移动了足够远, 就生成新的点, 否则只是修正最后的点
            const theDistance = this._lastPosition ? curPosition.getDistance(this._lastPosition) : -1;
            const count: uint = this._points.length;

            const prevLastPoint = this._points[count - 1];
            if (comp.emitting) {
                if (theDistance > comp.minVertexDistance || theDistance < 0) {
                    this._points.push({ position: Vector3.create().copy(curPosition), timeCreated: now });
                    if (!this._lastPosition) { this._lastPosition = Vector3.create(); }
                    this._lastPosition.copy(curPosition);

                    // 添加新的点到上一个点的距离
                    if (prevLastPoint) {
                        const newDistance = prevLastPoint.position.getDistance(curPosition);
                        this._pointDistances.push(newDistance);
                        this._distanceSum += newDistance;
                    }
                } else if (count > 0) {
                    prevLastPoint.position.copy(curPosition);
                    prevLastPoint.timeCreated = now;

                    // 更新末尾点到上一个点的距离
                    if (count > 1) {
                        const newDistance = prevLastPoint.position.getDistance(this._points[count - 2].position);
                        this._distanceSum = this._distanceSum - this._pointDistances[count - 1] + newDistance;
                        this._pointDistances[count - 1] = newDistance;
                    }
                }
            }

            // 移除过期的片段
            this._removeDeadPoints(now, comp.time * 1000);
        }
        /**
         * 移除超过生命周期的片段
         * @param now 当前时间戳
         * @param lifeTime 片段可存活时间
         */
        private _removeDeadPoints(now: float, lifeTime: float): void {
            const len = this._points.length;
            if (len === 0) { return; }

            for (let i: uint = 0; i < len; i++) {
                if (now - this._points[i].timeCreated < lifeTime) {
                    if (i > 0) {
                        this._points.splice(0, i);

                        for (let j = 0; j < i; j++) { this._distanceSum -= this._pointDistances[j]; }
                        this._pointDistances.splice(0, i);
                    }
                    break;
                }
            }
        }
        /**
         * 重新组成 mesh 的相关数据
         * @param now 当前时间戳
         */
        private _rebuildMeshData(now: float): void {
            this._resetMeshData();

            const count = this._points.length;
            if (count < 2) { return; }

            // 获取 camera
            const camera = this._getCamera();
            if (!camera) { return; }

            const comp = this._comp;

            let ratioSum: float = 0.0;
            const worldToLocalMatrix = comp.gameObject.transform.worldToLocalMatrix;
            let flip = false;
            let lastDirection: Vector3 | null = null;

            for (let i = 0; i < count; ++i) {
                const p = this._points[i];

                // 根据片段生存的时间获取对应的宽度和颜色采样
                const time = (now - p.timeCreated) / comp.time;
                // const color: Color = this._getColorSample(comp, time);
                const width: float = this._getWidthSample(comp, time);

                // 当前拖尾片段的向量
                const lineDirection = i === 0
                    ? vec3Substract(p.position, this._points[i + 1].position)
                    : vec3Substract(this._points[i - 1].position, p.position);

                // 当前摄像机到游戏对象的向量
                const vectorFacing = comp.Alignment === TrailAlignment.View
                    ? vec3Substract(camera.transform.position, p.position)
                    : comp.gameObject.transform.getForward(vec3());

                // 以上两者的叉乘即为拖尾移动方向的垂直向量
                const perpendicular = vec3Cross(lineDirection, vectorFacing).normalize();

                if (comp.autoFlip && i > 0 && lastDirection) {
                    if (lastDirection.dot(lineDirection) < 0) {
                        flip = !flip;
                    }
                }

                lastDirection = lineDirection;

                // 上述向量正反方向各走半个宽度值即为两个新的顶点值
                let vertex1: Vector3 = vec3Add(p.position, vec3Mutiply(perpendicular, width * 0.5)).applyMatrix(worldToLocalMatrix);
                let vertex2: Vector3 = vec3Add(p.position, vec3Mutiply(perpendicular, -width * 0.5)).applyMatrix(worldToLocalMatrix);
                if (flip) {
                    const temp = vertex1; vertex1 = vertex2; vertex2 = temp;
                }

                switch (comp.textureMode) {
                    case TrailTextureMode.Stretch:
                        ratioSum = this._buildMeshForTextureStretch(vertex1, vertex2, i, ratioSum);
                        break;
                    case TrailTextureMode.PerSegment:
                        this._buildMeshForTexturePerSegment(vertex1, vertex2, i);
                        break;
                    default: break;
                }
            }
        }
        private _buildMeshForTextureStretch(vertex1: Vector3, vertex2: Vector3, index: uint, ratioSum: float) {
            let i = index * 6;
            this._verticles[i + 0] = vertex1.x;
            this._verticles[i + 1] = vertex1.y;
            this._verticles[i + 2] = vertex1.z;
            this._verticles[i + 3] = vertex2.x;
            this._verticles[i + 4] = vertex2.y;
            this._verticles[i + 5] = vertex2.z;

            // 同样的颜色值
            // this._colors[i * 8 + 0] = color.r;
            // this._colors[i * 8 + 1] = color.g;
            // this._colors[i * 8 + 2] = color.b;
            // this._colors[i * 8 + 3] = color.a;
            // this._colors[i * 8 + 4] = color.r;
            // this._colors[i * 8 + 5] = color.g;
            // this._colors[i * 8 + 6] = color.b;
            // this._colors[i * 8 + 7] = color.a;

            // 两点的 uv 值
            const ratio = this._distanceSum ? this._pointDistances[index] / this._distanceSum : 0;
            ratioSum += ratio;
            i = index * 4;
            this._uvs[i + 0] = ratioSum;
            this._uvs[i + 1] = 1;
            this._uvs[i + 2] = ratioSum;
            this._uvs[i + 3] = 0;

            if (index > 0) {
                i = (index - 1) * 6;
                let i2 = index * 2;
                this._indices[i + 0] = i2 - 2;
                this._indices[i + 1] = i2 - 1;
                this._indices[i + 2] = i2;
                this._indices[i + 3] = i2 + 1;
                this._indices[i + 4] = i2;
                this._indices[i + 5] = i2 - 1;
            }
            return ratioSum;
        }

        private _buildMeshForTexturePerSegment(vertex1: Vector3, vertex2: Vector3, index: uint) {
            let vIndex = (index - 1) * 12 + 6;
            this._verticles[vIndex + 0] = vertex1.x;
            this._verticles[vIndex + 1] = vertex1.y;
            this._verticles[vIndex + 2] = vertex1.z;

            this._verticles[vIndex + 3] = vertex2.x;
            this._verticles[vIndex + 4] = vertex2.y;
            this._verticles[vIndex + 5] = vertex2.z;

            let uvIndex = (index - 1) * 8 + 4;
            let uv = index > 0 ? 1 : 0;
            this._uvs[uvIndex + 0] = uv;
            this._uvs[uvIndex + 1] = 1;
            this._uvs[uvIndex + 2] = uv;
            this._uvs[uvIndex + 3] = 0;

            if (index > 0 && index < this._points.length) {
                if (index < this._points.length) {
                    vIndex += 6;
                    this._verticles[vIndex + 0] = vertex1.x;
                    this._verticles[vIndex + 1] = vertex1.y;
                    this._verticles[vIndex + 2] = vertex1.z;

                    this._verticles[vIndex + 3] = vertex2.x;
                    this._verticles[vIndex + 4] = vertex2.y;
                    this._verticles[vIndex + 5] = vertex2.z;

                    uvIndex += 4;
                    uv = 0;
                    this._uvs[uvIndex + 0] = uv;
                    this._uvs[uvIndex + 1] = 1;
                    this._uvs[uvIndex + 2] = uv;
                    this._uvs[uvIndex + 3] = 0;
                }

                let iIndex = (index - 1) * 6;
                const i = (index - 1) * 4 + 2
                this._indices[iIndex + 0] = i - 2;
                this._indices[iIndex + 1] = i - 1;
                this._indices[iIndex + 2] = i - 0;
                this._indices[iIndex + 3] = i + 1;
                this._indices[iIndex + 4] = i - 0;
                this._indices[iIndex + 5] = i - 1;
            }
        }
        // TODO: 支持颜色参数
        // /**
        //  * 根据时间在获得颜色值取样
        //  * @param comp 拖尾组件
        //  * @param time 时间比例值
        //  */
        // private _getColorSample(comp: TrailComponent, time: float): Color {
        //     const color: Color = Color.create();
        //     if (comp.color.length > 0) {
        //         const colorTime = time * (comp.color.length - 1);
        //         const min = Math.floor(colorTime);
        //         const max = math.clamp(Math.ceil(colorTime), 0, comp.color.length - 1);
        //         const lerp = math.inverseLerp(min, max, colorTime);
        //         color.lerp(comp.color[min], comp.color[max], lerp);
        //     } else {
        //         color.lerp(Color.WHITE, Color.ZERO, time);
        //     }
        //     return comp.color;
        // }
        /**
         * 根据时间在获得宽度值取样
         * @param comp 拖尾组件
         * @param time 时间比例值
         */
        private _getWidthSample(comp: TrailComponent, time: float): number {
            // let width: float;
            // if (comp.width.length > 0) {
            //     const widthTime = time * (comp.width.length - 1);
            //     const min = Math.floor(widthTime);
            //     const max = math.clamp(Math.ceil(widthTime), 0, comp.width.length - 1);
            //     const lerp = math.inverseLerp(min, max, widthTime);
            //     width = math.lerp(comp.width[min], comp.width[max], lerp);
            // } else {
            //     width = 1;
            // }
            return comp.width;
        }
        /**
         * 获取渲染用的相机
         */
        private _getCamera(): Camera | undefined {
            return Camera.main;
        }
        /**
         * 重置组成 `Mesh` 的相关数据
         */
        private _resetMeshData() {
            this._verticles.length = 0;
            this._uvs.length = 0;
            this._colors.length = 0;
            this._indices.length = 0;
        }
        /**
         * 更新 `Mesh` 内容
         */
        private _composeMesh() {
            if (this._points.length > this._maxFragmentCount) {
                this._maxFragmentCount = this._points.length;
                this._createMesh();
            }

            if (!this._mesh) { return; }

            let buff = this._mesh.getAttributes(gltf.AttributeSemantics.POSITION);
            if (buff) { buff.fill(0.0); }
            this._mesh.setAttributes(gltf.AttributeSemantics.POSITION, this._verticles);

            buff = this._mesh.getAttributes(gltf.AttributeSemantics.TEXCOORD_0);
            if (buff) { buff.fill(0.0); }
            this._mesh.setAttributes(gltf.AttributeSemantics.TEXCOORD_0, this._uvs);

            // buff = this._mesh.getAttributes(gltf.AttributeSemantics.COLOR_0);
            // if (buff) { buff.fill(0.0); }
            // this._mesh.setAttributes(gltf.AttributeSemantics.COLOR_0, this._colors);

            buff = this._mesh.getIndices();
            if (buff) { buff.fill(0.0); }
            this._mesh.setIndices(this._indices);

            this._mesh.uploadVertexBuffer();
            this._mesh.uploadSubIndexBuffer(0);
        }
        /**
         * 生成 `Mesh` 对象
         */
        private _createMesh() {
            this._mesh = Mesh.create((this._maxFragmentCount - 1) * 4, (this._maxFragmentCount - 1) * 6);
            // 把 mesh 传给 MeshFilter 组件
            const meshFilter = this._comp.gameObject.getComponent(MeshFilter);
            if (!meshFilter) {
                console.warn(`no MeshFilter on Trail object(${this._comp.gameObject.name})`);
                return;
            }
            meshFilter.mesh = this._mesh;

            // TODO: 设置使用颜色
            // const meshRenderer = this._comp.gameObject.getComponent(MeshRenderer);
            // meshRenderer.material.addDefine(egret3d.ShaderDefine.USE_COLOR);
        }
        /**
         * 销毁时释放 mesh
         */
        private _releaseMesh() {
            const meshFilter = this._comp.gameObject.getComponent(MeshFilter);
            if (!meshFilter) {
                console.warn(`no MeshFilter on Trail object(${this._comp.gameObject.name})`);
                return;
            }
            if (meshFilter.mesh === this._mesh) {
                meshFilter.mesh = null;
            };
            this._mesh = null;
        }
        private _onPausedChanged() {
            if (this._comp.paused) { // 暂停
                this.pause();
            } else { // 恢复运行
                this.resume();
            }
        }
        private _onEmittingChanged() {
            // 重新播放前重置状态
            if (this._comp.emitting) {
                this._reset();
            }
        }
    }
}
