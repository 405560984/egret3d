namespace egret3d {
    /**
     * @private
     */
    export class AnimationBinder extends paper.BaseRelease<AnimationBinder> {
        private static _instances = [] as AnimationBinder[];

        public static create() {
            let instance: AnimationBinder;
            if (this._instances.length > 0) {
                instance = this._instances.pop()!;
                instance._released = false;
            }
            else {
                instance = new AnimationBinder();
                instance.onClear();
            }

            return instance;
        }

        public dirty: uint;
        public totalWeight: number;
        public weight: number;
        public target: paper.BaseComponent | any;
        public bindPose: any;
        public layer: AnimationLayer | null;
        public updateTarget: () => void;

        private constructor() {
            super();
        }

        public onClear() {
            this.clear();

            if (this.bindPose && this.bindPose.release) { // TODO
                this.bindPose.release();
            }

            this.target = null!;
            this.bindPose = null;
            this.updateTarget = null!;
        }

        public clear() {
            this.dirty = 0;
            this.totalWeight = 0.0;
            this.weight = 1.0;
            this.layer = null;
        }

        public updateBlend(animationState: AnimationState) {
            const globalWeight = animationState._globalWeight;

            if (this.dirty > 0) {
                if (this.layer === animationState.animationLayer) {
                    this.dirty++;
                    this.weight = globalWeight;
                    this.totalWeight += this.weight;

                    return true;
                }
                else if (this.totalWeight < 1.0 - Const.EPSILON) {
                    this.dirty++;
                    this.weight = globalWeight * (1.0 - this.totalWeight);
                    this.totalWeight += this.weight;
                    this.layer = animationState.animationLayer;

                    return true;
                }

                return false;
            }

            this.dirty++;
            this.totalWeight += globalWeight;
            this.weight = globalWeight;
            this.layer = animationState.animationLayer;

            return true;
        }

        public onUpdateTranslation() {
            const transforms = this.target;
            const target = (transforms as Transform).localPosition as Vector3;

            if (this.totalWeight < 1.0 - Const.EPSILON) {
                const weight = 1.0 - this.totalWeight;
                const bindPose = this.bindPose as Vector3;

                if (this.dirty > 0) {
                    target.x += bindPose.x * weight;
                    target.y += bindPose.y * weight;
                    target.z += bindPose.z * weight;
                }
                else {
                    target.x = bindPose.x * weight;
                    target.y = bindPose.y * weight;
                    target.z = bindPose.z * weight;
                }
            }

            target.update();
        }

        public onUpdateRotation() {
            const transforms = this.target;
            const target = (transforms as Transform).localRotation as Quaternion;

            if (this.totalWeight < 1.0 - Const.EPSILON) {
                const weight = 1.0 - this.totalWeight;
                const bindPose = this.bindPose as Quaternion;

                if (this.dirty > 0) {
                    target.x += bindPose.x * weight;
                    target.y += bindPose.y * weight;
                    target.z += bindPose.z * weight;
                    target.w += bindPose.w * weight;
                }
                else {
                    target.x = bindPose.x * weight;
                    target.y = bindPose.y * weight;
                    target.z = bindPose.z * weight;
                    target.w = bindPose.w * weight;
                }
            }

            target.normalize();
            target.update();
        }

        public onUpdateScale() {
            const transforms = this.target;
            const target = (transforms as Transform).localScale as Vector3;

            if (this.totalWeight < 1.0 - Const.EPSILON) {
                const weight = 1.0 - this.totalWeight;
                const bindPose = this.bindPose as Vector3;

                if (this.dirty > 0) {
                    target.x += bindPose.x * weight;
                    target.y += bindPose.y * weight;
                    target.z += bindPose.z * weight;
                }
                else {
                    target.x = bindPose.x * weight;
                    target.y = bindPose.y * weight;
                    target.z = bindPose.z * weight;
                }
            }

            target.update();
        }
    }
}