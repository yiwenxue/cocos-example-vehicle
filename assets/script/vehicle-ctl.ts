import { _decorator, Component, Node, Quat, 
    RigidBody, Vec3, input, Input, EventKeyboard, 
    KeyCode, Camera, ConfigurableConstraint, physics, math,
} from 'cc';

const { ccclass, property } = _decorator;

class key_mapping {
    accelerate: KeyCode;
    brake: KeyCode;
    left: KeyCode;
    right: KeyCode;
    gearUp: KeyCode;
    gearDown: KeyCode;
    handbrake: KeyCode;
    reset: KeyCode;
    camera_inside: KeyCode;
    camera_back: KeyCode;
    camera_default: KeyCode;
};

class key_status {
    accelerate: boolean;
    brake: boolean;
    left: boolean;
    right: boolean;
    gearUp: boolean;
    gearDown: boolean;
    handbrake: boolean;
    reset: boolean;
    camera_inside: boolean;
    camera_back: boolean;
    camera_default: boolean;
};

const key_mapping_normal = {
    accelerate: KeyCode.KEY_W,
    brake: KeyCode.KEY_S,
    left: KeyCode.KEY_A,
    right: KeyCode.KEY_D,
    gearUp: KeyCode.KEY_Q,
    gearDown: KeyCode.KEY_E,
    handbrake: KeyCode.SPACE,
    reset: KeyCode.KEY_R,
    camera_inside: KeyCode.KEY_C,
    camera_back: KeyCode.KEY_B,
    camera_default: KeyCode.KEY_V,
};

const key_mapping_rally = {
    accelerate: KeyCode.KEY_A,
    brake: KeyCode.KEY_Z,
    left: KeyCode.COMMA,
    right: KeyCode.PERIOD,
    gearUp: KeyCode.KEY_S,
    gearDown: KeyCode.KEY_X,
    handbrake: KeyCode.SPACE,
    reset: KeyCode.KEY_R,
    camera_inside: KeyCode.KEY_C,
    camera_back: KeyCode.KEY_B,
    camera_default: KeyCode.KEY_V,
};

class camera_vision {
    position: Vec3;
    orientation: Quat;
}

const camera_preset = {
    'default': {
        position: new Vec3(0, 2, 8),
        orientation: new Quat(),
    },
    'back': {
        position: new Vec3(0, 2, -8),
        orientation: new Quat(0, 1, 0, 0),
    },
    'inside': {
        position: new Vec3(0, 1, 0),
        orientation: new Quat(),
    },
};

class car_config {
    maxSteeringAngle: number;
    maxSpeed: number;
    maxPower: number;
    maxBrake: number;
    smoothBufferLength: number;
    blendingFactor: number;
};

const car_preset: car_config = {
    maxSteeringAngle: 45,
    maxSpeed: 320,
    maxPower: 1000,
    maxBrake: 1000,
    smoothBufferLength: 10,
    blendingFactor: 0.2,
};

@ccclass('Vehicle')
export class Vehicle extends Component {
    @property({ type: Node })
    public car: Node = null!;

    public frontLeftWheel: Node = null!;
    public frontRightWheel: Node = null!;
    public rearLeftWheel: Node = null!;
    public rearRightWheel: Node = null!;
    public frontLeftHub: Node = null!;
    public frontRightHub: Node = null!;
    public carBody: Node = null!;
    public mainCamera: Camera = null!;
    public framework: Node = null!;

    private _key_mapping: key_mapping;
    private _key_status: key_status;

    private _maxPower = 1000;
    private _currentGear = 0;
    private _gears = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    private _speedLevel = 0;
    private _speedLevels = [-20, 0, 20, 40, 60, 90, 120, 160, 200, 240, 280, 320];
    private _strengthLevels = [50, 0, 50, 25, 16.66, 11.11, 8.33, 6.25, 5.00, 4.16, 3.57, 3.12];
    private _currentSpeed = 0;
    private _currentStrength = 0;

    private _currentVisionPreset: camera_vision = camera_preset['default'];
    private _persistentVision: camera_vision = camera_vision['default'];

    private _onAcceleration = false;
    private _steeringDelta = 0;
    
    private _bufferSize = car_preset.smoothBufferLength;
    private _bufferIndex = 0;
    
    private _smoothedSteeringAngle = 0;
    private _smoothedPosition = new Vec3(0, 0, 0);
    private _smoothedOrientation = new Quat(0, 0, 0, 0);
    private _smoothedTargetVelocity = new Vec3(0, 0, 0);
    
    private _smoothedVelocity = new Vec3(0, 0, 0);
    private _prevPosition = new Vec3(0, 0, 0);

    start() {
        this.carBody = this.car.getChildByName('body')!;
        this.framework = this.car.getChildByName('framework')!;
        this.frontLeftWheel = this.car.getChildByName('Wheel-000')!;
        this.frontRightWheel = this.car.getChildByName('Wheel-001')!;
        this.rearLeftWheel = this.car.getChildByName('Wheel-010')!;
        this.rearRightWheel = this.car.getChildByName('Wheel-011')!;

        this.frontLeftHub = this.car.getChildByName('hub-000')!;
        this.frontRightHub = this.car.getChildByName('hub-001')!;

        this.mainCamera = this.node.getChildByName('vehicle-camera')!.getComponent(Camera)!;

        // monitor input events, wasd
        const com0 = this.frontLeftHub.getComponent(physics.ConfigurableConstraint);
        if (com0) {
            com0.angularDriverSettings.twistDrive = 1;
        }
        const com1 = this.frontRightHub.getComponent(physics.ConfigurableConstraint);
        if (com1) {
            com1.angularDriverSettings.twistDrive = 1;
        }
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyRelease, this);
    }

    update(deltaTime: number) {
        this._bufferIndex = (this._bufferIndex + 1) % this._bufferSize;
        this.updateVision(this._bufferIndex);
        this.updateSteering(this._bufferIndex);

        this.updateVelocityInfo(deltaTime);
    }

    changeGear(event: '+' | '-') {
        if (event === '-') {
            this._currentGear--;
        } else {
            this._currentGear++;
        }
        if (this._currentGear < this._gears[0]) {
            this._currentGear = this._gears[0];
        }
        if (this._currentGear > this._gears[this._gears.length - 1]) {
            this._currentGear = this._gears[this._gears.length - 1];
        }
        this.setGear(this._currentGear);
    }

    setGear (gear: number) {
        this._currentGear = gear;
        const index = this._gears.indexOf(gear);
        this._speedLevel = index;
        this._currentStrength = this._strengthLevels[index] / 50.0; // divide by factor to make it more realistic
        this._currentSpeed = this._speedLevels[index];
        
        if (this._onAcceleration) {
            this._setDrivingSpeed(this._currentSpeed);
            this._setDrivingForce(this._currentStrength);
        }
    }

    updateSteering(index: number) {
        this._smoothedSteeringAngle = math.lerp(this._smoothedSteeringAngle, this._steeringDelta, 0.08);
        this._setSteeringAngle(this._smoothedSteeringAngle);
    }

    updateVision (index: number) {
        const vision = this._currentVisionPreset;
        const position = this.car.getWorldPosition();
        const rotation = this.car.getWorldRotation();
        const scale = this.car.getWorldScale();

        Vec3.lerp(this._smoothedPosition, this._smoothedPosition, position, 0.3);
        Quat.slerp(this._smoothedOrientation, this._smoothedOrientation, rotation, 0.3);

        const targetPosition = new Vec3();
        const targetRotation = new Quat();

        Vec3.transformQuat(targetPosition, vision.position, rotation);
        Vec3.multiply(targetPosition, targetPosition, scale);
        Vec3.add(targetPosition, targetPosition, position);
        Quat.multiply(targetRotation, this._smoothedOrientation, vision.orientation);
        this.mainCamera.node.setWorldPosition(targetPosition);
        this.mainCamera.node.setWorldRotation(targetRotation);
    }

    updateVelocity (deltaTime: number) {
    }

    updateVelocityInfo (deltaTime: number) {
        const position = this.car.getWorldPosition();
        const velocity = Vec3.subtract(new Vec3(), position, this._prevPosition);
        Vec3.multiplyScalar(velocity, velocity, 1 / deltaTime);
        this._prevPosition = position;
        Vec3.lerp(this._smoothedVelocity, this._smoothedVelocity, velocity, 0.1);
    }

    reset () {
        this.resetTo(new Vec3(0, 0, 0), new Quat());
    }

    resetTo(position: Vec3, orientation: Quat) {
        this.setGear(0);
        this.resetRigidBody(this.car.getChildByName('framework')!);
        this.resetRigidBody(this.car.getChildByName('body')!);
        this.resetRigidBody(this.car.getChildByName('Wheel-000')!);
        this.resetRigidBody(this.car.getChildByName('Wheel-001')!);
        this.resetRigidBody(this.car.getChildByName('Wheel-010')!);
        this.resetRigidBody(this.car.getChildByName('Wheel-011')!);
        this.resetRigidBody(this.car.getChildByName('hub-000')!);
        this.resetRigidBody(this.car.getChildByName('hub-001')!);
        this.resetRigidBody(this.car.getChildByName('hub-010')!);
        this.resetRigidBody(this.car.getChildByName('hub-011')!);
        this.car.setWorldPosition(position);
        this.car.setWorldRotation(orientation);
        const framework = this.car.getChildByName('framework')!;
        framework.setWorldPosition(position);
        framework.setWorldRotation(orientation);
        this.carBody.setWorldPosition(position);
        this.carBody.setWorldRotation(orientation);
    }

    resetRigidBody(body: Node) {
        const rigid = body.getComponent(RigidBody);
        if (rigid) {
            rigid.clearState();
            rigid.setLinearVelocity(new Vec3());
            rigid.setAngularVelocity(new Vec3());
        }
    }

    _setDrivingForce(strength: number) {
        let com = this.frontLeftWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.strength = strength;
        }
        com = this.frontRightWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.strength = strength;
        }
        com = this.rearLeftWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.strength = strength;
        }
        com = this.rearRightWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.strength = strength;
        }
    }

    _setDrivingSpeed(speed: number) {
        speed = - speed * 10; 
        let com = this.frontLeftWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.targetVelocity.x = speed;
            com.angularDriverSettings.targetVelocity = com.angularDriverSettings.targetVelocity;
        }
        com = this.frontRightWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.targetVelocity.x = speed;
            com.angularDriverSettings.targetVelocity = com.angularDriverSettings.targetVelocity;
        }
        com = this.rearLeftWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.targetVelocity.x = speed;
            com.angularDriverSettings.targetVelocity = com.angularDriverSettings.targetVelocity;
        }
        com = this.rearRightWheel.getComponent(ConfigurableConstraint);
        if (com) {
            com.angularDriverSettings.targetVelocity.x = speed;
            com.angularDriverSettings.targetVelocity = com.angularDriverSettings.targetVelocity;
        }
    }

    _setSteeringAngle(angle: number) {
        const com0 = this.frontLeftHub.getComponent(physics.ConfigurableConstraint);
        if (com0) {
            com0.angularDriverSettings.targetOrientation.x = angle;
            com0.angularDriverSettings.targetOrientation = com0.angularDriverSettings.targetOrientation;
        }
        const com1 = this.frontRightHub.getComponent(physics.ConfigurableConstraint);
        if (com1) {
            com1.angularDriverSettings.targetOrientation.x = angle;
            com1.angularDriverSettings.targetOrientation = com1.angularDriverSettings.targetOrientation;
        }
    }

    setBrakingForce(force: number) {
        // console.log('setBrakingForce', force);
    }

    getSpeedKmHour() {
        return Vec3.len(this._smoothedVelocity) * 3.6;
    }

    onKeyDown(e: EventKeyboard) {
        const Mapping = this._key_mapping;
        const Status = this._key_status;
        switch (e.keyCode) {
            case Mapping.accelerate:
                this._setDrivingSpeed(this._currentSpeed);
                this._setDrivingForce(this._currentStrength);
                this._onAcceleration = true;
                Status.accelerate = true;
                break;
            case Mapping.left:
                this._steeringDelta = car_preset.maxSteeringAngle;
                Status.left = true;
                break;
            case Mapping.right:
                this._steeringDelta = -car_preset.maxSteeringAngle;
                Status.right = true;
                break;
            case Mapping.gearDown:
                this.changeGear('-');
                Status.gearDown = true;
                break;
            case Mapping.gearUp:
                this.changeGear('+');
                Status.gearUp = true;
                break;
            case Mapping.reset:
                this.reset();
                Status.reset = true;
                break;
            case Mapping.camera_inside:
                this._persistentVision = camera_preset['inside'];
                this._currentVisionPreset = this._persistentVision;
                Status.camera_inside = true;
                break;
            case Mapping.camera_default:
                this._persistentVision = camera_preset['default'];
                this._currentVisionPreset = this._persistentVision;
                Status.camera_default = true;
                break;
            case Mapping.camera_back:
                this._currentVisionPreset = camera_preset['back'];
                Status.camera_back = true;
                break;
            case Mapping.brake:
                Status.brake = true;
                break;
            case Mapping.handbrake:
                Status.handbrake = true;
                break;
            default: break;
        }
    }

    onKeyRelease(e: EventKeyboard) {
        const Mapping = this._key_mapping;
        const Status = this._key_status;
        switch (e.keyCode) {
            case Mapping.accelerate:
                this._setDrivingForce(0);
                this._setDrivingSpeed(0);
                this._onAcceleration = false;
                Status.accelerate = false;
                break;
            case Mapping.left:
                this._steeringDelta = 0;
                Status.left = false;
                break;
            case Mapping.right:
                this._steeringDelta = 0;
                Status.right = false;
                break;
            case Mapping.gearDown:
                Status.gearDown = false;
                break;
            case Mapping.gearUp:
                Status.gearUp = false;
                break;
            case Mapping.reset:
                Status.reset = false;
                break;    
            case Mapping.camera_inside:
                this._currentVisionPreset = this._persistentVision;
                Status.camera_inside = false;
                break;
            case Mapping.camera_default:
                this._currentVisionPreset = this._persistentVision;
                Status.camera_default = false;
                break;
            case Mapping.camera_back:
                this._currentVisionPreset = this._persistentVision;
                Status.camera_back = false;
                break;
            case Mapping.brake:
                Status.brake = false;
                break;
            case Mapping.handbrake:
                Status.handbrake = false;
                break;
            default: break;
        }
    }
}