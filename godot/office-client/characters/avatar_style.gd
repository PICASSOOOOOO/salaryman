extends RefCounted
## Shared high-resolution, pixel-inspired look for animated humanoid avatars.

const HEAD_SCALE := 0.80


static func apply(model: Node3D) -> void:
	var suit_meshes: Array[MeshInstance3D] = []
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		var normalized := _normalized_name(mesh_instance.name)
		var lowered := mesh_instance.name.to_lower()
		if lowered.contains("glasses") or lowered.contains("eyewear"):
			mesh_instance.visible = false
		elif normalized == "headmesh":
			_strip_merged_eyewear(mesh_instance)

		if mesh_instance.mesh == null:
			continue
		if normalized == "jackettiepantsmesh":
			suit_meshes.append(mesh_instance)
			continue
		var color := _avatar_color(normalized)
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source := mesh_instance.get_active_material(surface_index)
			var material := (
				source.duplicate() as StandardMaterial3D
				if source is StandardMaterial3D
				else StandardMaterial3D.new()
			)
			material.albedo_texture = null if color != Color.TRANSPARENT else material.albedo_texture
			material.albedo_color = color if color != Color.TRANSPARENT else material.albedo_color
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			material.roughness = 0.88
			material.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
			mesh_instance.set_surface_override_material(surface_index, material)

	_split_suit_meshes(suit_meshes)

	for node in model.find_children("*", "Skeleton3D", true, false):
		var skeleton := node as Skeleton3D
		for bone_index in range(skeleton.get_bone_count()):
			if skeleton.get_bone_name(bone_index).to_lower() == "head":
				skeleton.set_bone_pose_scale(bone_index, Vector3.ONE * HEAD_SCALE)
				skeleton.force_update_all_bone_transforms()
				return


static func _avatar_color(normalized_mesh_name: String) -> Color:
	match normalized_mesh_name:
		"salarymanmesh":
			return Color("#c68b68")
		"highpolymesh", "proceduralshorthair", "proceduralshorthair001", "proceduralsideburn", "proceduralsideburn001":
			return Color("#563a2a")
		"ivoryshirtfront", "shirtcollar":
			return Color("#f5f1e7")
		"burgundytie":
			return Color("#17191c")
		"planemesh":
			return Color("#222428")
	return Color.TRANSPARENT


static func _split_suit_meshes(suit_meshes: Array[MeshInstance3D]) -> void:
	var jacket_material := _flat_material(Color("#263f65"))
	var trouser_material := _flat_material(Color("#202328"))
	for mesh_instance in suit_meshes:
		if not mesh_instance.mesh is ArrayMesh:
			continue
		var source_mesh := mesh_instance.mesh as ArrayMesh
		if source_mesh.get_surface_count() != 1 or source_mesh.get_blend_shape_count() > 0:
			continue
		var source_arrays := source_mesh.surface_get_arrays(0)
		var vertices: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
		var source_indices: PackedInt32Array = source_arrays[Mesh.ARRAY_INDEX]
		var jacket_indices := PackedInt32Array()
		var trouser_indices := PackedInt32Array()
		for index in range(0, source_indices.size(), 3):
			var center_y := (
				vertices[source_indices[index]].y
				+ vertices[source_indices[index + 1]].y
				+ vertices[source_indices[index + 2]].y
			) / 3.0
			var destination := trouser_indices if center_y < 0.325 else jacket_indices
			destination.append_array(PackedInt32Array([
				source_indices[index],
				source_indices[index + 1],
				source_indices[index + 2],
			]))
		var split_mesh := ArrayMesh.new()
		var trouser_arrays: Array = source_arrays.duplicate()
		trouser_arrays[Mesh.ARRAY_INDEX] = trouser_indices
		split_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, trouser_arrays)
		var jacket_arrays: Array = source_arrays.duplicate()
		jacket_arrays[Mesh.ARRAY_INDEX] = jacket_indices
		split_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, jacket_arrays)
		mesh_instance.mesh = split_mesh
		mesh_instance.set_surface_override_material(0, trouser_material)
		mesh_instance.set_surface_override_material(1, jacket_material)


static func _flat_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.84
	material.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	return material


static func _normalized_name(node_name: String) -> String:
	return node_name.to_lower().replace(".", "").replace("_", "").replace("-", "").replace(" ", "")


static func _strip_merged_eyewear(head_mesh: MeshInstance3D) -> void:
	if not head_mesh.mesh is ArrayMesh:
		return
	var source_mesh := head_mesh.mesh as ArrayMesh
	if source_mesh.get_surface_count() != 1 or source_mesh.get_blend_shape_count() > 0:
		return
	var arrays := source_mesh.surface_get_arrays(0)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var source_indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	if vertices.is_empty() or source_indices.is_empty():
		return

	var parents := PackedInt32Array()
	parents.resize(vertices.size())
	for vertex_index in range(vertices.size()):
		parents[vertex_index] = vertex_index
	for index in range(0, source_indices.size(), 3):
		_union_vertices(parents, source_indices[index], source_indices[index + 1])
		_union_vertices(parents, source_indices[index + 1], source_indices[index + 2])

	var bounds_by_root: Dictionary = {}
	for vertex_index in range(vertices.size()):
		var root := _find_root(parents, vertex_index)
		var point := vertices[vertex_index]
		if not bounds_by_root.has(root):
			bounds_by_root[root] = {
				"min_x": point.x, "max_x": point.x,
				"min_y": point.y, "max_y": point.y,
				"min_z": point.z, "max_z": point.z,
			}
		else:
			var bounds: Dictionary = bounds_by_root[root]
			bounds["min_x"] = minf(bounds["min_x"], point.x)
			bounds["max_x"] = maxf(bounds["max_x"], point.x)
			bounds["min_y"] = minf(bounds["min_y"], point.y)
			bounds["max_y"] = maxf(bounds["max_y"], point.y)
			bounds["min_z"] = minf(bounds["min_z"], point.z)
			bounds["max_z"] = maxf(bounds["max_z"], point.z)
			bounds_by_root[root] = bounds

	var removed_roots: Dictionary = {}
	for root in bounds_by_root:
		if _is_eyewear_component(bounds_by_root[root]):
			removed_roots[root] = true
	if removed_roots.is_empty():
		return

	var kept_indices := PackedInt32Array()
	for index in range(0, source_indices.size(), 3):
		if removed_roots.has(_find_root(parents, source_indices[index])):
			continue
		kept_indices.append_array(PackedInt32Array([
			source_indices[index],
			source_indices[index + 1],
			source_indices[index + 2],
		]))
	arrays[Mesh.ARRAY_INDEX] = kept_indices
	var filtered_mesh := ArrayMesh.new()
	filtered_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	head_mesh.mesh = filtered_mesh


static func _is_eyewear_component(bounds: Dictionary) -> bool:
	if bounds["min_y"] < 0.46 or bounds["max_y"] > 0.52:
		return false
	var side_distance := absf((bounds["min_x"] + bounds["max_x"]) * 0.5)
	var min_z: float = bounds["min_z"]
	var max_z: float = bounds["max_z"]
	if side_distance < 0.05 and bounds["max_x"] - bounds["min_x"] < 0.08 and min_z > 0.155:
		return true
	if side_distance > 0.14 and side_distance < 0.17 and min_z > 0.14 and max_z > 0.16:
		return true
	return side_distance > 0.155 and side_distance < 0.18 and min_z < 0.0 and max_z < 0.15


static func _find_root(parents: PackedInt32Array, vertex_index: int) -> int:
	var root := vertex_index
	while parents[root] != root:
		root = parents[root]
	while parents[vertex_index] != vertex_index:
		var next := parents[vertex_index]
		parents[vertex_index] = root
		vertex_index = next
	return root


static func _union_vertices(parents: PackedInt32Array, first: int, second: int) -> void:
	var first_root := _find_root(parents, first)
	var second_root := _find_root(parents, second)
	if first_root != second_root:
		parents[first_root] = second_root
