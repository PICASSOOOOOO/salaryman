extends RefCounted

## Deterministic, renderer-only scenery for the space beyond the Tower's B1 gate.
## The JSON plan is the editable scene specification; the generator builds its
## terrain foundation first, then hardscape regions and independent landmarks.

const PLAN_PATH := "res://tower_exterior_plan.json"
const WORLD_SCALE := 0.01
const FLOOR_TOP_Y := 0.16


static func build(floor_plan: Dictionary) -> Node3D:
	var base_layout_value: Variant = floor_plan.get("baseLayout", {})
	if not base_layout_value is Dictionary:
		push_error("Tower landscape cannot find baseLayout in floor_plan.json")
		return null
	var bounds_value: Variant = base_layout_value.get("outerBounds", [])
	if not bounds_value is Array or bounds_value.size() < 4:
		push_error("Tower landscape needs the building's outer bounds")
		return null

	var plan_value: Variant = JSON.parse_string(FileAccess.get_file_as_string(PLAN_PATH))
	if not plan_value is Dictionary or not plan_value.has("facades"):
		push_error("Tower exterior plan is missing or invalid: " + PLAN_PATH)
		return null

	var root := Node3D.new()
	root.name = "TowerExteriorBackdrop"
	_build_from_plan(root, plan_value, bounds_value)
	return root


static func _build_from_plan(root: Node3D, plan: Dictionary, bounds: Array) -> void:
	var materials := _make_materials()
	var bounds_x := float(bounds[0]) * WORLD_SCALE
	var bounds_z := float(bounds[1]) * WORLD_SCALE
	var bounds_width := float(bounds[2]) * WORLD_SCALE
	var bounds_depth := float(bounds[3]) * WORLD_SCALE
	var seed_value := int(plan.get("seed", 1999))
	var facades: Array = plan.get("facades", [])
	for facade_index in range(facades.size()):
		var facade_value: Variant = facades[facade_index]
		if not facade_value is Dictionary:
			continue
		_build_facade_backdrop(
			root,
			facade_value,
			facade_index,
			Rect2(bounds_x, bounds_z, bounds_width, bounds_depth),
			plan,
			materials,
			seed_value,
		)


static func _build_facade_backdrop(
	parent: Node3D,
	facade: Dictionary,
	facade_index: int,
	building_bounds: Rect2,
	plan: Dictionary,
	materials: Dictionary,
	seed_value: int,
) -> void:
	var side := str(facade.get("side", ""))
	if side not in ["west", "east"]:
		push_error("Tower landscape facade must face west or east")
		return

	var outward := -1.0 if side == "west" else 1.0
	var edge_x := building_bounds.position.x
	if side == "east":
		edge_x += building_bounds.size.x
	var depth := maxf(float(facade.get("depth", 72.0)), 12.0)
	var setback := clampf(float(facade.get("setback", 1.25)), 0.5, depth - 1.0)
	var ground_depth := depth - setback
	var ground_center_x := edge_x + outward * (setback + ground_depth / 2.0)
	var ground_center_z := building_bounds.position.y + building_bounds.size.y / 2.0
	var facade_root := Node3D.new()
	facade_root.name = side.capitalize() + "Landscape"
	parent.add_child(facade_root)

	var terrain := _add_terrain(
		facade_root,
		Vector2(ground_center_x, ground_center_z),
		Vector2(ground_depth, building_bounds.size.y),
		Vector2i(10, maxi(int(building_bounds.size.y / 10.0), 2)),
		float(plan.get("heightAmplitude", 0.12)),
		seed_value + facade_index * 7919,
		materials["terrain"],
	)
	terrain.name = "TerrainFoundation"

	_add_tree_rows(
		facade_root,
		side,
		edge_x,
		outward,
		building_bounds.position.y,
		building_bounds.position.y + building_bounds.size.y,
		facade.get("treeRows", []),
		seed_value + facade_index * 104729,
		materials,
	)
	_add_building_rows(
		facade_root,
		side,
		edge_x,
		outward,
		building_bounds.position.y,
		building_bounds.position.y + building_bounds.size.y,
		facade.get("buildingRows", []),
		seed_value + facade_index * 130363,
		materials,
	)


static func _add_tree_rows(
	parent: Node3D,
	side: String,
	edge_x: float,
	outward: float,
	start_z: float,
	end_z: float,
	rows: Array,
	seed_value: int,
	materials: Dictionary,
) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var foliage_colors: Array[Color] = [
		Color("#557b54"),
		Color("#68855a"),
		Color("#718c5c"),
		Color("#597951"),
	]
	for row_index in range(rows.size()):
		var row_value: Variant = rows[row_index]
		if not row_value is Dictionary:
			continue
		var row: Dictionary = row_value
		var spacing := maxf(float(row.get("spacing", 32.0)), 8.0)
		var z := start_z + spacing * 0.42
		var tree_index := 0
		while z < end_z:
			var jitter := rng.randf_range(-spacing * 0.12, spacing * 0.12)
			var tree_x := edge_x + outward * (
				float(row.get("depth", 8.0)) + rng.randf_range(-0.8, 0.8)
			)
			var tree_z := clampf(z + jitter, start_z + 1.0, end_z - 1.0)
			var height := rng.randf_range(3.6, 5.4)
			var tree_root := Node3D.new()
			tree_root.name = "%s_tree_%02d_%02d" % [side, row_index, tree_index]
			tree_root.position = Vector3(
				tree_x,
				_terrain_height(tree_x, tree_z, float(0.12), seed_value),
				tree_z,
			)
			parent.add_child(tree_root)
			_add_tree(tree_root, height, foliage_colors[rng.randi_range(0, foliage_colors.size() - 1)], materials)
			z += spacing
			tree_index += 1


static func _add_building_rows(
	parent: Node3D,
	side: String,
	edge_x: float,
	outward: float,
	start_z: float,
	end_z: float,
	rows: Array,
	seed_value: int,
	materials: Dictionary,
) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var facade_colors: Array[Color] = [Color("#9e987c"), Color("#788579"), Color("#a78d70")]
	for row_index in range(rows.size()):
		var row_value: Variant = rows[row_index]
		if not row_value is Dictionary:
			continue
		var row: Dictionary = row_value
		var row_id := str(row.get("id", "skyline"))
		var spacing := maxf(float(row.get("spacing", 56.0)), 28.0)
		var z := start_z + spacing * 0.5
		var building_index := 0
		while z < end_z:
			if rng.randf() <= clampf(float(row.get("density", 0.9)), 0.0, 1.0):
				var height_range: Array = row.get("heightRange", [10.0, 24.0])
				var depth_range: Array = row.get("depthRange", [11.0, 17.0])
				var frontage_range: Array = row.get("frontageRange", [15.0, 24.0])
				if height_range.size() >= 2 and depth_range.size() >= 2 and frontage_range.size() >= 2:
					var block_depth := rng.randf_range(float(depth_range[0]), float(depth_range[1]))
					var block_frontage := rng.randf_range(
						float(frontage_range[0]), float(frontage_range[1])
					)
					var center_z := clampf(
						z + rng.randf_range(-spacing * 0.12, spacing * 0.12),
						start_z + block_frontage / 2.0,
						end_z - block_frontage / 2.0,
					)
					var center_x := edge_x + outward * (
						float(row.get("depth", 22.0)) + rng.randf_range(-1.2, 1.2)
					)
					var height := rng.randf_range(float(height_range[0]), float(height_range[1]))
					var block := Node3D.new()
					block.name = "%s_%s_%02d" % [side, row_id, building_index]
					block.position = Vector3(
						center_x,
						_terrain_height(center_x, center_z, float(0.12), seed_value),
						center_z,
					)
					if side == "west":
						block.rotation.y = PI
					parent.add_child(block)
					_add_city_block(
						block,
						Vector2(block_depth, block_frontage),
						height,
						facade_colors[rng.randi_range(0, facade_colors.size() - 1)],
						materials,
					)
			z += spacing
			building_index += 1


static func _make_materials() -> Dictionary:
	return {
		"terrain": _material(Color("#71816a"), 0.96),
		"path": _material(Color("#c4b595"), 0.9),
		"road": _material(Color("#414d4b"), 0.96),
		"platform": _material(Color("#b4aa91"), 0.88),
		"garden": _material(Color("#53674b"), 0.97),
		"curb": _material(Color("#d4c8a8"), 0.84),
		"marking": _material(Color("#e4d7b5"), 0.78),
		"wood": _material(Color("#8a6947"), 0.82),
		"metal": _material(Color("#345a56"), 0.38, 0.35),
		"glass": _material(Color("#9dc8bd"), 0.24, 0.45),
		"solar": _material(Color("#294c50"), 0.28, 0.52),
		"trunk": _material(Color("#625242"), 0.94),
		"foliage": _material(Color("#5f8057"), 0.93),
		"lamp": _material(Color("#f3cc74"), 0.35, 0.0, Color("#f3cc74")),
		"window": _material(Color("#628f8a"), 0.3, 0.24),
		"facade_a": _material(Color("#9e987c"), 0.88),
		"facade_b": _material(Color("#788579"), 0.88),
		"facade_c": _material(Color("#a78d70"), 0.88),
		"roof": _material(Color("#53655c"), 0.84),
	}


static func _material(
	color: Color,
	roughness: float,
	metallic := 0.0,
	emission := Color(0.0, 0.0, 0.0, 0.0),
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic
	if emission.a > 0.0:
		material.emission_enabled = true
		material.emission = emission
		material.emission_energy_multiplier = 0.42
	return material


static func _add_terrain(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	segments: Vector2i,
	amplitude: float,
	seed_value: int,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	surface.set_material(material)
	for x_step in range(segments.x):
		for z_step in range(segments.y):
			var x0 := center.x - size.x / 2.0 + size.x * float(x_step) / float(segments.x)
			var x1 := center.x - size.x / 2.0 + size.x * float(x_step + 1) / float(segments.x)
			var z0 := center.y - size.y / 2.0 + size.y * float(z_step) / float(segments.y)
			var z1 := center.y - size.y / 2.0 + size.y * float(z_step + 1) / float(segments.y)
			var p00 := Vector3(x0, _terrain_height(x0, z0, amplitude, seed_value), z0)
			var p10 := Vector3(x1, _terrain_height(x1, z0, amplitude, seed_value), z0)
			var p01 := Vector3(x0, _terrain_height(x0, z1, amplitude, seed_value), z1)
			var p11 := Vector3(x1, _terrain_height(x1, z1, amplitude, seed_value), z1)
			surface.add_vertex(p00)
			surface.add_vertex(p01)
			surface.add_vertex(p10)
			surface.add_vertex(p10)
			surface.add_vertex(p01)
			surface.add_vertex(p11)
	surface.generate_normals()

	var instance := MeshInstance3D.new()
	instance.mesh = surface.commit()
	instance.material_override = material
	parent.add_child(instance)
	return instance


static func _terrain_height(x: float, z: float, amplitude: float, seed_value: int) -> float:
	var phase := float(posmod(seed_value, 997)) * 0.003
	var broad := sin(x * 0.12 + phase) * cos(z * 0.11 - phase)
	var fine := sin((x + z) * 0.31 + phase * 0.5) * 0.24
	return FLOOR_TOP_Y + amplitude * (broad * 0.76 + fine)


static func _add_region(parent: Node3D, region: Dictionary, materials: Dictionary) -> void:
	var center_values: Array = region.get("center", [])
	var size_values: Array = region.get("size", [])
	if center_values.size() < 2 or size_values.size() < 2:
		push_error("Tower exterior region is missing its center or size: " + str(region.get("id", "unknown")))
		return
	var center := Vector2(float(center_values[0]), float(center_values[1]))
	var size := Vector2(float(size_values[0]), float(size_values[1]))
	var region_id := str(region.get("id", "region")).replace("-", "_")
	var kind := str(region.get("kind", ""))
	var region_node := Node3D.new()
	region_node.name = region_id
	parent.add_child(region_node)
	match kind:
		"path":
			_add_surface(region_node, region_id, center, size, materials["path"], 0.07)
			_add_path_seams(region_node, center, size)
		"street":
			_add_surface(region_node, region_id, center, size, materials["road"], 0.12)
			_add_street_markings(region_node, center, size, materials)
		"platform":
			_add_surface(region_node, region_id, center, size, materials["platform"], 0.1)
		"garden":
			_add_surface(region_node, region_id, center, size, materials["garden"], 0.08)
			_add_planter_edges(region_node, center, size, materials["curb"])
		"crosswalk":
			_add_crosswalk(region_node, center, size, materials["marking"])
		_:
			push_error("Unsupported Tower exterior region kind: " + kind)


static func _add_surface(
	parent: Node3D,
	name: String,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
	thickness: float,
) -> void:
	var ground_y := _terrain_height(center.x, center.y, 0.045, 1999)
	_box(
		parent,
		name + "_surface",
		Vector3(center.x, ground_y + thickness / 2.0, center.y),
		Vector3(size.x, thickness, size.y),
		material,
	)


static func _add_path_seams(parent: Node3D, center: Vector2, size: Vector2) -> void:
	var mat := _material(Color("#a99878"), 0.92)
	var seam_count := int(size.x / 2.2)
	for seam_index in range(1, seam_count):
		var x := center.x - size.x / 2.0 + float(seam_index) * size.x / float(seam_count)
		_box(
			parent,
			"paver_joint_%02d" % seam_index,
			Vector3(x, FLOOR_TOP_Y + 0.08, center.y),
			Vector3(0.035, 0.012, size.y * 0.94),
			mat,
		)


static func _add_street_markings(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	materials: Dictionary,
) -> void:
	for mark_index in range(6):
		var z := center.y - size.y / 2.0 + 5.0 + float(mark_index) * 9.0
		_box(
			parent,
			"lane_dash_%02d" % mark_index,
			Vector3(center.x, FLOOR_TOP_Y + 0.1325, z),
			Vector3(0.11, 0.025, 3.6),
			materials["marking"],
		)
	_box(
		parent,
		"north_curb",
		Vector3(center.x, FLOOR_TOP_Y + 0.11, center.y - size.y / 2.0 + 0.3),
		Vector3(size.x, 0.18, 0.26),
		materials["curb"],
	)
	_box(
		parent,
		"south_curb",
		Vector3(center.x, FLOOR_TOP_Y + 0.11, center.y + size.y / 2.0 - 0.3),
		Vector3(size.x, 0.18, 0.26),
		materials["curb"],
	)


static func _add_crosswalk(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
) -> void:
	for stripe_index in range(7):
		var x := center.x - size.x / 2.0 + 0.45 + float(stripe_index) * (size.x - 0.9) / 6.0
		_box(
			parent,
			"crosswalk_stripe_%02d" % stripe_index,
			Vector3(x, FLOOR_TOP_Y + 0.1375, center.y),
			Vector3(0.48, 0.035, size.y),
			material,
		)


static func _add_planter_edges(
	parent: Node3D,
	center: Vector2,
	size: Vector2,
	material: StandardMaterial3D,
) -> void:
	var y := FLOOR_TOP_Y + 0.28
	_box(parent, "planter_north_edge", Vector3(center.x, y, center.y - size.y / 2.0), Vector3(size.x, 0.22, 0.24), material)
	_box(parent, "planter_south_edge", Vector3(center.x, y, center.y + size.y / 2.0), Vector3(size.x, 0.22, 0.24), material)
	_box(parent, "planter_west_edge", Vector3(center.x - size.x / 2.0, y, center.y), Vector3(0.24, 0.22, size.y), material)
	_box(parent, "planter_east_edge", Vector3(center.x + size.x / 2.0, y, center.y), Vector3(0.24, 0.22, size.y), material)


static func _add_landmark(
	parent: Node3D,
	landmark: Dictionary,
	materials: Dictionary,
	seed_value: int,
) -> void:
	var position_values: Array = landmark.get("position", [])
	if position_values.size() < 2:
		push_error("Tower exterior landmark is missing its position: " + str(landmark.get("id", "unknown")))
		return
	var center := Vector2(float(position_values[0]), float(position_values[1]))
	var landmark_root := Node3D.new()
	landmark_root.name = str(landmark.get("id", "landmark")).replace("-", "_")
	landmark_root.position = Vector3(center.x, _terrain_height(center.x, center.y, 0.045, seed_value), center.y)
	parent.add_child(landmark_root)
	match str(landmark.get("kind", "")):
		"tree":
			_add_tree(landmark_root, float(landmark.get("height", 4.3)), Color(str(landmark.get("foliage", "#5f8057"))), materials)
		"street-light":
			_add_street_light(landmark_root, materials)
		"solar-shelter":
			var shelter_size: Array = landmark.get("size", [11, 6])
			if shelter_size.size() >= 2:
				_add_solar_shelter(landmark_root, Vector2(float(shelter_size[0]), float(shelter_size[1])), materials)
		"city-block":
			var building_size: Array = landmark.get("size", [11, 15])
			if building_size.size() >= 2:
				var facade := Color(str(landmark.get("facade", "#9e987c")))
				_add_city_block(
					landmark_root,
					Vector2(float(building_size[0]), float(building_size[1])),
					float(landmark.get("height", 12.0)),
					facade,
					materials,
				)
		_:
			push_error("Unsupported Tower exterior landmark kind: " + str(landmark.get("kind", "")))


static func _add_tree(
	parent: Node3D,
	height: float,
	foliage_color: Color,
	materials: Dictionary,
) -> void:
	var trunk_height := height * 0.55
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.16
	trunk.bottom_radius = 0.24
	trunk.height = trunk_height
	trunk.radial_segments = 7
	_mesh(parent, "trunk", trunk, Vector3(0.0, trunk_height / 2.0, 0.0), materials["trunk"])

	var canopy := SphereMesh.new()
	canopy.radius = height * 0.34
	canopy.height = height * 0.58
	canopy.radial_segments = 8
	canopy.rings = 4
	var leaf_material := _material(foliage_color, 0.94)
	_mesh(parent, "canopy", canopy, Vector3(0.0, height * 0.76, 0.0), leaf_material)

	var side_canopy := SphereMesh.new()
	side_canopy.radius = height * 0.24
	side_canopy.height = height * 0.42
	side_canopy.radial_segments = 7
	side_canopy.rings = 4
	_mesh(parent, "canopy_west", side_canopy, Vector3(-height * 0.19, height * 0.7, 0.1), leaf_material)
	_mesh(parent, "canopy_east", side_canopy, Vector3(height * 0.18, height * 0.71, -0.1), leaf_material)


static func _add_street_light(parent: Node3D, materials: Dictionary) -> void:
	var post := CylinderMesh.new()
	post.top_radius = 0.07
	post.bottom_radius = 0.11
	post.height = 5.0
	post.radial_segments = 8
	_mesh(parent, "post", post, Vector3(0.0, 2.5, 0.0), materials["metal"])
	_box(parent, "arm", Vector3(-0.62, 4.84, 0.0), Vector3(1.2, 0.09, 0.09), materials["metal"])
	var lamp := SphereMesh.new()
	lamp.radius = 0.16
	lamp.height = 0.2
	lamp.radial_segments = 8
	lamp.rings = 4
	_mesh(parent, "warm_lamp", lamp, Vector3(-1.14, 4.75, 0.0), materials["lamp"])


static func _add_solar_shelter(
	parent: Node3D,
	size: Vector2,
	materials: Dictionary,
) -> void:
	var half_x := size.x / 2.0
	var half_z := size.y / 2.0
	for x_sign in [-1.0, 1.0]:
		for z_sign in [-1.0, 1.0]:
			_box(
				parent,
				"enamel_column_%s_%s" % [str(x_sign), str(z_sign)],
				Vector3(x_sign * (half_x - 0.45), 1.75, z_sign * (half_z - 0.4)),
				Vector3(0.22, 3.5, 0.22),
				materials["metal"],
			)
	_box(parent, "canopy_beam_west", Vector3(-half_x / 2.0, 3.5, 0.0), Vector3(0.18, 0.18, size.y), materials["metal"])
	_box(parent, "canopy_beam_east", Vector3(half_x / 2.0, 3.5, 0.0), Vector3(0.18, 0.18, size.y), materials["metal"])
	_box(parent, "canopy_solar_roof", Vector3(0.0, 3.68, 0.0), Vector3(size.x, 0.18, size.y), materials["solar"])
	for panel_index in range(4):
		var z := -half_z + 0.9 + float(panel_index) * (size.y - 1.8) / 3.0
		_box(parent, "roof_panel_%02d" % panel_index, Vector3(0.0, 3.79, z), Vector3(size.x - 1.0, 0.035, 0.12), materials["glass"])
	_box(parent, "bench_seat", Vector3(0.9, 0.62, 0.0), Vector3(2.8, 0.16, 0.56), materials["wood"])
	_box(parent, "bench_back", Vector3(0.9, 1.08, -0.22), Vector3(2.8, 0.68, 0.13), materials["wood"])
	_box(parent, "arrival_panel", Vector3(-half_x + 0.75, 1.55, half_z - 0.32), Vector3(0.12, 2.5, 1.2), materials["glass"])


static func _add_city_block(
	parent: Node3D,
	size: Vector2,
	height: float,
	facade_color: Color,
	materials: Dictionary,
) -> void:
	var facade_material := _material(facade_color, 0.9)
	_box(
		parent,
		"building_mass",
		Vector3(0.0, height / 2.0, 0.0),
		Vector3(size.x, height, size.y),
		facade_material,
	)
	_box(
		parent,
		"roof_garden_parapet",
		Vector3(0.0, height + 0.18, 0.0),
		Vector3(size.x + 0.32, 0.36, size.y + 0.32),
		materials["roof"],
	)
	var floor_count := maxi(int(height / 3.0), 2)
	var window_rows := mini(floor_count, 5)
	for row in range(window_rows):
		var y := 2.2 + float(row) * (height - 3.8) / float(maxi(window_rows - 1, 1))
		for column in range(3):
			var z := -size.y * 0.31 + float(column) * size.y * 0.31
			_box(
				parent,
				"west_window_%02d_%02d" % [row, column],
				Vector3(-size.x / 2.0 - 0.065, y, z),
				Vector3(0.13, 1.45, 1.55),
				materials["window"],
			)
	for panel_index in range(3):
		var z := -size.y * 0.3 + float(panel_index) * size.y * 0.3
		_box(
			parent,
			"roof_solar_panel_%02d" % panel_index,
			Vector3(0.0, height + 0.42, z),
			Vector3(size.x * 0.54, 0.08, size.y * 0.18),
			materials["solar"],
		)


static func _box(
	parent: Node3D,
	node_name: String,
	position: Vector3,
	size: Vector3,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return _mesh(parent, node_name, mesh, position, material)


static func _mesh(
	parent: Node3D,
	node_name: String,
	mesh: Mesh,
	position: Vector3,
	material: StandardMaterial3D,
) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = node_name
	instance.mesh = mesh
	instance.material_override = material
	instance.position = position
	parent.add_child(instance)
	return instance
