extends "res://main.gd"

## Alternate camera for the live Tower scene. The native Godot world, voxel
## character, furniture builders, interface, and Python authority stay intact.

const SIDE_CAMERA_ORTHO_SIZE := 17.0
const SIDE_CAMERA_DISTANCE := 15.0
const SIDE_CAMERA_ELEVATION_DEGREES := 38.0
const SIDE_CAMERA_TARGET_HEIGHT := 0.86
const SIDE_VIEW_ROOM_IDS := ["recreation", "floor07_business"]
const SIDE_VIEW_ROOT_IDS := [
	"BridgeObjects",
	"AutomationCharacters",
	"BasementPestsAndCrew",
	"AuthoritativePlayer",
	"SideViewWarmHallLight",
]
var visible_room_id := ""


static func side_camera_offset(
	distance: float = SIDE_CAMERA_DISTANCE,
	elevation_degrees: float = SIDE_CAMERA_ELEVATION_DEGREES,
) -> Vector3:
	var elevation := deg_to_rad(elevation_degrees)
	return Vector3(0.0, sin(elevation) * distance, cos(elevation) * distance)


func _build_building_shell() -> void:
	world_root = Node3D.new()
	world_root.name = "ShadowTower"
	add_child(world_root)

	dynamic_root = Node3D.new()
	dynamic_root.name = "BridgeObjects"
	world_root.add_child(dynamic_root)

	automation_root = Node3D.new()
	automation_root.name = "AutomationCharacters"
	world_root.add_child(automation_root)

	basement_actor_root = Node3D.new()
	basement_actor_root.name = "BasementPestsAndCrew"
	world_root.add_child(basement_actor_root)

	floor_plan_data = _load_floor_plan()
	var structure: Dictionary = floor_plan_data.get("baseLayout", {}).get("structure", {})
	structural_wall_thickness = maxf(float(structure.get("wallThicknessMeters", 0.3)), 0.12)
	wall_service_cavity = clampf(
		float(structure.get("wallServiceCavityMeters", 0.12)),
		0.0,
		structural_wall_thickness * 0.6,
	)

	for room_value in floor_plan_data.get("rooms", []):
		if not room_value is Dictionary:
			continue
		var room: Dictionary = room_value
		var room_id := str(room.get("id", ""))
		if room_id not in SIDE_VIEW_ROOM_IDS:
			continue
		var bounds: Array = room.get("bounds", [])
		if bounds.size() < 4:
			continue
		_add_room_shell(
			{
				"id": room_id,
				"label": room.get("label", room_id),
				"rect": Rect2(bounds[0], bounds[1], bounds[2], bounds[3]),
				"renderOffset": room.get("renderOffset", [0, 0]),
				"material": room.get("material", "hall_floor"),
				"doorSide": room.get("doorSide", ""),
				"entrance": room.get("entrance", []),
				"outsideWindow": room.get("outsideWindow", []),
				"officeWindow": room.get("officeWindow", []),
			},
			floor_plan_data,
		)

	_add_room_light(
		"SideViewWarmHallLight",
		Vector3(311.0, 3.0, 15.0),
		Color("#ffd29a"),
		0.62,
		24.0,
	)


func _build_static_furniture() -> void:
	imported_scenes["table"] = load("res://agentshire-assets/furniture/table_medium.gltf")
	imported_scenes["chair"] = load("res://agentshire-assets/furniture/chair_A.gltf")
	imported_scenes["lamp"] = load("res://agentshire-assets/furniture/lamp_standing.gltf")
	imported_scenes["character"] = load("res://agentshire-assets/characters/character-male-a.glb")


func _update_camera(_delta: float) -> void:
	if camera == null:
		camera = Camera3D.new()
		camera.name = "TowerSideViewCamera"
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.near = 0.05
		camera.far = 300.0
		add_child(camera)
		camera.current = true

	camera.size = SIDE_CAMERA_ORTHO_SIZE
	camera_target = visual_player_world + Vector3(0.0, SIDE_CAMERA_TARGET_HEIGHT, 0.0)
	camera.position = camera_target + side_camera_offset()
	camera.look_at(camera_target, Vector3.UP)


func _apply_snapshot(message: Dictionary) -> void:
	super._apply_snapshot(message)
	if world_root == null:
		return
	var scene_data: Dictionary = message.get("scene", {})
	var room_id := str(scene_data.get("room", ""))
	if room_id == visible_room_id:
		return
	visible_room_id = room_id
	for child in world_root.get_children():
		var node_name := str(child.name)
		if node_name in SIDE_VIEW_ROOT_IDS or node_name == "PlayerShadow":
			continue
		var room_geometry := false
		for room_prefix in SIDE_VIEW_ROOM_IDS:
			if node_name.begins_with(room_prefix):
				room_geometry = true
				break
		child.visible = room_geometry and node_name.begins_with(room_id)
