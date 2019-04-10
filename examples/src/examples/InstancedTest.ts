namespace examples {

    export class InstancedTest {

        async start() {
            // Load resource config.
            await RES.loadConfig("default.res.json", "resource/");
            
            egret3d.Camera.main.gameObject.addComponent(Start);
        }
    }

    class Start extends paper.Behaviour {

        public onAwake() {            
            egret3d.renderState.enableGPUInstancing = true;

            const mainCamera = egret3d.Camera.main;

            { // Main camera.
                mainCamera.fov = 40.0 * egret3d.Const.DEG_RAD;
                mainCamera.far = 10000.0;
                mainCamera.near = 1.0;
                mainCamera.backgroundColor.fromHex(0xFFFFFF);
                mainCamera.transform.setLocalPosition(0.0, 0.0, -3200.0);
                mainCamera.gameObject.addComponent(behaviors.FollowTouch);
            }

            { // Create game objects.
                const sphereMesh = egret3d.MeshBuilder.createSphere(100.0, 0.0, 0.0, 0.0, 20.0, 20.0);
                const sphere = egret3d.creater.createGameObject("Sphere", {
                    mesh: sphereMesh,
                    material: egret3d.Material.create(egret3d.DefaultShaders.MESH_NORMAL)
                });
                sphere.addComponent(behaviors.Wander).radius = 2000.0;

                const coneMesh = egret3d.MeshBuilder.createCylinder(0.0, 10.0, 100.0).applyMatrix(egret3d.Matrix4.create().fromRotationX(Math.PI * 0.5));
                const coneMaterial = egret3d.Material.create(egret3d.DefaultShaders.MESH_NORMAL);
                coneMaterial.enableGPUInstancing = true;
                for (let i = 0; i < 5000; ++i) {
                    const cone = egret3d.creater.createGameObject(`Cone ${i}`, {
                        mesh: coneMesh,
                        material: coneMaterial
                    });
                    cone.transform
                        .setLocalPosition(
                            Math.random() * 4000.0 - 2000.0,
                            Math.random() * 4000.0 - 2000.0,
                            Math.random() * 4000.0 - 2000.0,
                        )
                        .setLocalScale(Math.random() * 4.0 + 2.0);
                    cone.addComponent(behaviors.LookAtTarget).target = sphere;
                }
            }
        }
    }

}