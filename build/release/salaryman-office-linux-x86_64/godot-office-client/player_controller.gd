extends CharacterBody3D
class_name OfficePlayerController

signal action_requested(action: String)

const WALK_SPEED := 3.0
const SPRINT_SPEED := 5.0
const ACCELERATION := 15.0
const FRICTION := 20.0
const GRAVITY := 18.0
const JUMP_SPEED := 5.0
const MODEL_SCALE := 2.15
const CHARACTER_ALBEDO := preload("res://agentshire-assets/characters/Textures/colormap.png")

var character_scene: PackedScene
var visual_root: Node3D
var animation_player: AnimationPlayer
var bridge_connected := false
var authoritative_action := "stand"
var authoritative_position_received := false
var mouse_sprint_toggled := false
var in_danger := false

var _local_action := ""
var _action_lock := 0.0
var _current_animation := ""
var _facing := Vector3.FORWARD
var _maintenance_clock := 0.0


static func sprint_input_active(shift_pressed: bool, mouse_three_toggled: bool) -> bool:
	return shift_pressed or mouse_three_toggled


static func weapon_action_allowed(danger_active: bool) -> bool:
	return danger_active


func toggle_mouse_sprint() -> bool:
	mouse_sprint_toggled = not mouse_sprint_toggled
	return mouse_sprint_toggled


static func is_jump_input(event: InputEvent) -> bool:
	if event is InputEventKey:
		var key_event := event as InputEventKey
		return key_event.pressed and not key_event.echo and key_event.keycode == KEY_SPACE
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		return mouse_event.pressed and mouse_event.button_index == MOUSE_BUTTON_WHEEL_DOWN
	return false


func configure_character(scene: PackedScene) -> void:
	character_scene = scene


func _ready() -> void:
	collision_layer = 2
	collision_mask = 1
	floor_snap_length = 0.18
	floor_stop_on_slope = true

	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.36
	capsule.height = 1.46
	var collision := CollisionShape3D.new()
	collision.name = "PlayerCollision"
	collision.shape = capsule
	collision.position.y = capsule.height / 2.0 - 0.015
	add_child(collision)

	if character_scene == null:
		push_error("Godot character scene is required for the office player.")
		return
	visual_root = character_scene.instantiate() as Node3D
	if visual_root == null:
		push_error("The Godot character scene did not instantiate as Node3D.")
		return
	visual_root.name = "CharacterModel"
	add_child(visual_root)
	animation_player = configure_character_model(visual_root)
	_play_animation("idle")


static func configure_character_model(model: Node3D, scale_value: float = MODEL_SCALE) -> AnimationPlayer:
	model.scale = Vector3.ONE * scale_value
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source_material := mesh_instance.get_active_material(surface_index)
			var material := source_material.duplicate() as StandardMaterial3D if source_material is StandardMaterial3D else StandardMaterial3D.new()
			material.albedo_texture = CHARACTER_ALBEDO
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			material.roughness = 0.82
			mesh_instance.set_surface_override_material(surface_index, material)
	var animation_nodes := model.find_children("*", "AnimationPlayer", true, false)
	if animation_nodes.is_empty():
		return null
	return animation_nodes[0] as AnimationPlayer


func set_bridge_connected(connected: bool) -> void:
	bridge_connected = connected


func requested_movement() -> Vector2:
	if not bridge_connected or authoritative_action in ["sit", "sleep", "maintenance"]:
		return Vector2.ZERO
	var x := float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT))
	x -= float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT))
	var y := float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN))
	y -= float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))
	return Vector2(x, y).limit_length(1.0)


func wants_sprint() -> bool:
	return (
		not requested_movement().is_zero_approx()
		and sprint_input_active(
			Input.is_key_pressed(KEY_SHIFT),
			mouse_sprint_toggled,
		)
	)


func set_authoritative_action(action: String) -> void:
	authoritative_action = action if action in ["sit", "sleep", "maintenance"] else "stand"
	if authoritative_action in ["sit", "sleep"]:
		velocity.x = 0.0
		velocity.z = 0.0


func reconcile_authoritative_position(target: Vector3) -> void:
	if not authoritative_position_received:
		global_position = target
		authoritative_position_received = true
		return
	var error := Vector2(global_position.x - target.x, global_position.z - target.z)
	if error.length() > 1.25:
		global_position.x = target.x
		global_position.z = target.z
		velocity.x = 0.0
		velocity.z = 0.0
	else:
		global_position.x = lerpf(global_position.x, target.x, 0.18)
		global_position.z = lerpf(global_position.z, target.z, 0.18)


func try_jump() -> void:
	if not bridge_connected or not is_on_floor() or authoritative_action in ["sit", "sleep"]:
		return
	if _action_lock > 0.0:
		return
	velocity.y = JUMP_SPEED
	_begin_action("jump", "jump", 0.35)
	action_requested.emit("jump")


func try_fight() -> void:
	if not weapon_action_allowed(in_danger):
		return
	_try_combat_action("fight", "attack-melee-right", 0.4)


func set_danger_state(danger_active: bool) -> void:
	in_danger = danger_active


func try_sweep() -> void:
	_try_combat_action("sweep", "attack-kick-left", 0.45)


func _try_combat_action(action: String, animation: String, minimum_lock: float) -> void:
	if not bridge_connected or authoritative_action in ["sit", "sleep"] or _action_lock > 0.0:
		return
	_begin_action(action, animation, minimum_lock)
	action_requested.emit(action)


func _begin_action(action: String, animation: String, minimum_lock: float) -> void:
	_local_action = action
	var clip_length := minimum_lock
	if animation_player != null and animation_player.has_animation(animation):
		clip_length = maxf(minimum_lock, animation_player.get_animation(animation).length)
	_action_lock = clip_length
	_play_animation(animation)


func _physics_process(delta: float) -> void:
	if _action_lock > 0.0:
		_action_lock = maxf(0.0, _action_lock - delta)
		if _action_lock == 0.0:
			_local_action = ""

	var movement := requested_movement()
	var direction := Vector3(movement.x, 0.0, movement.y)
	if not direction.is_zero_approx():
		direction = direction.normalized()
		_facing = direction
		if visual_root != null:
			visual_root.rotation.y = atan2(_facing.x, -_facing.z)
	var sprinting := not movement.is_zero_approx() and wants_sprint()
	var speed := SPRINT_SPEED if sprinting else WALK_SPEED
	velocity.x = move_toward(velocity.x, direction.x * speed, ACCELERATION * delta)
	velocity.z = move_toward(velocity.z, direction.z * speed, ACCELERATION * delta)

	if is_on_floor():
		if velocity.y < 0.0:
			velocity.y = 0.0
	else:
		velocity.y -= GRAVITY * delta

	move_and_slide()
	if authoritative_action == "maintenance":
		_maintenance_clock += delta
		if visual_root != null:
			visual_root.position.y = sin(_maintenance_clock * 10.0) * 0.025
			visual_root.rotation.z = sin(_maintenance_clock * 5.0) * 0.035
	else:
		_maintenance_clock = 0.0
		if visual_root != null:
			visual_root.position.y = 0.0
			visual_root.rotation.z = 0.0
	_update_locomotion_animation(sprinting)


func _update_locomotion_animation(sprinting: bool) -> void:
	if _local_action != "":
		return
	if authoritative_action == "sit":
		_play_animation("sit")
		return
	if authoritative_action == "sleep":
		_play_animation("sit")
		return
	if authoritative_action == "maintenance":
		_play_animation("idle")
		return
	if not is_on_floor():
		_play_animation("jump" if velocity.y > 0.0 else "fall")
		return
	if Vector2(velocity.x, velocity.z).length() > 0.12:
		_play_animation("sprint" if sprinting else "walk")
	else:
		_play_animation("idle")


func _play_animation(animation: String) -> void:
	if animation_player == null or not animation_player.has_animation(animation):
		return
	if _current_animation == animation and animation_player.is_playing():
		return
	_current_animation = animation
	animation_player.play(animation)
