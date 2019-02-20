namespace examples {

    export class BehaviourLifeCycleTest implements Example {

        async start() {
            // Create camera.
            egret3d.Camera.main;

            {
                const gameObject = egret3d.creater.createGameObject("CubeA", { mesh: egret3d.DefaultMeshes.CUBE });
                gameObject.transform.setLocalPosition(2.0, 0.0, 0.0);
                gameObject.activeSelf = false;

                gameObject.addComponent(BehaviourTest);
                gameObject.addComponent(BehaviourTest);
            }

            {
                const gameObject = egret3d.creater.createGameObject("CubeB", { mesh: egret3d.DefaultMeshes.CUBE });
                gameObject.transform.setLocalPosition(-2.0, 0.0, 0.0);

                gameObject.addComponent(BehaviourTest);
                gameObject.addComponent(BehaviourTest);
            }
        }
    }

    @paper.allowMultiple
    class BehaviourTest extends paper.Behaviour {
        public onAwake() {
            console.info("onAwake", this.gameObject.name);
        }

        public onEnable() {
            console.info("onEnable", this.gameObject.name);
        }

        public onStart() {
            console.info("onStart", this.gameObject.name);
        }

        public onFixedUpdate() {
            // console.info("onFixedUpdate");
        }

        public onUpdate() {
            // console.info("onUpdate");
        }

        public onLateUpdate() {
            // console.info("onLateUpdate");
        }

        public onDisable() {
            console.info("onDisable", this.gameObject.name);
        }

        public onDestroy() {
            console.info("onDestroy", this.gameObject.name);
        }
    }
}