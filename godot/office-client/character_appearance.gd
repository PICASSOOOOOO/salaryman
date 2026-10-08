extends RefCounted
class_name OfficeCharacterAppearance

const SOURCE_PALETTE := preload("res://agentshire-assets/characters/Textures/colormap.png")
const BASE_MODEL_SCALE := 2.15
const ROLE_LOOKS := {
	"salaryman": {
		"suit": "#29394d",
		"green": "#35564a",
		"accent": "#703b46",
		"brass": "#947749",
		"leather": "#674a3b",
		"charcoal": "#353940",
		"shirt": "#d8cfbd",
	},
	"operations": {
		"suit": "#353b40",
		"green": "#405647",
		"accent": "#86563f",
		"brass": "#927b4e",
		"leather": "#604939",
		"charcoal": "#30373a",
		"shirt": "#d9d0be",
	},
	"finance": {
		"suit": "#343943",
		"green": "#394d46",
		"accent": "#94794a",
		"brass": "#a48852",
		"leather": "#5f4c3d",
		"charcoal": "#30343a",
		"shirt": "#ded6c5",
	},
	"research": {
		"suit": "#34414e",
		"green": "#396057",
		"accent": "#805d49",
		"brass": "#927b50",
		"leather": "#624b3b",
		"charcoal": "#333a42",
		"shirt": "#dcd5c4",
	},
	"creative": {
		"suit": "#343e4d",
		"green": "#40594c",
		"accent": "#78454d",
		"brass": "#987a48",
		"leather": "#67493c",
		"charcoal": "#323941",
		"shirt": "#ded4c1",
	},
	"service": {
		"suit": "#35424a",
		"green": "#40584c",
		"accent": "#81533e",
		"brass": "#a08250",
		"leather": "#694f3e",
		"charcoal": "#343a3d",
		"shirt": "#e0d7c5",
	},
	"reception": {
		"suit": "#344b40",
		"green": "#52644b",
		"accent": "#a0824e",
		"brass": "#ad915a",
		"leather": "#664d3d",
		"charcoal": "#304139",
		"shirt": "#e3dac8",
	},
}

static var _palette_cache: Dictionary = {}


static func look_for_role(role: String) -> String:
	var normalized := role.to_lower().replace("_", "-")
	if normalized.contains("account") or normalized.contains("finance"):
		return "finance"
	if normalized.contains("research") or normalized.contains("analysis"):
		return "research"
	if normalized.contains("market") or normalized.contains("creative"):
		return "creative"
	if normalized.contains("crm") or normalized.contains("call") or normalized.contains("support"):
		return "service"
	if normalized.contains("reception"):
		return "reception"
	if normalized.contains("operation") or normalized.contains("business") or normalized.contains("ops"):
		return "operations"
	var choices := ["operations", "finance", "research", "creative", "service"]
	return choices[posmod(role.hash(), choices.size())]


static func apply(model: Node3D, appearance: String, scale_value: float) -> void:
	var look := appearance if ROLE_LOOKS.has(appearance) else "salaryman"
	if not ROLE_LOOKS.has(appearance):
		push_error("Unknown character appearance '%s'; using salaryman look." % appearance)
	var scale_factor := scale_value / BASE_MODEL_SCALE
	model.scale = Vector3(0.85, 3.8, 1.3) * scale_factor
	_reduce_head_proportions(model)

	var palette := _palette_for(look)
	if palette == null:
		return
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			var source_material := mesh_instance.get_active_material(surface_index)
			var material := source_material.duplicate() as StandardMaterial3D if source_material is StandardMaterial3D else StandardMaterial3D.new()
			material.albedo_texture = palette
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
			material.roughness = 0.76
			material.metallic = 0.0
			mesh_instance.set_surface_override_material(surface_index, material)
	_add_tie(model, look)


static func _palette_for(look: String) -> Texture2D:
	if _palette_cache.has(look):
		return _palette_cache[look] as Texture2D
	var source_image := SOURCE_PALETTE.get_image()
	if source_image.is_compressed() and source_image.decompress() != OK:
		push_error("Could not decompress the Godot character palette.")
		return null
	var image := source_image.duplicate()
	var style: Dictionary = ROLE_LOOKS[look]
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var color := image.get_pixel(x, y)
			var replacement := _professional_color(color, style)
			if replacement != color:
				image.set_pixel(x, y, replacement)
	var texture := ImageTexture.create_from_image(image)
	_palette_cache[look] = texture
	return texture


static func _professional_color(source: Color, style: Dictionary) -> Color:
	if source.a < 0.01 or source.v < 0.05 or source.s < 0.18:
		return source
	var hue := source.h
	if hue >= 0.28 and hue < 0.49 and source.s > 0.25:
		return _retone(source, str(style["green"]))
	if hue >= 0.08 and hue < 0.19 and source.s > 0.40:
		return _retone(source, str(style["brass"]))
	if hue >= 0.02 and hue < 0.08 and source.s > 0.65:
		return _retone(source, str(style["leather"]))
	if (hue < 0.025 or hue > 0.96 or (hue >= 0.80 and hue < 0.96)) and source.s > 0.40:
		return _retone(source, str(style["accent"]))
	if hue >= 0.52 and hue < 0.72:
		if source.s < 0.35 and source.v > 0.68:
			return _retone(source, str(style["shirt"]))
		if source.s > 0.28:
			return _retone(source, str(style["suit"]))
	if hue >= 0.72 and hue < 0.90 and source.s > 0.28:
		return _retone(source, str(style["charcoal"]))
	return source


static func _retone(source: Color, target_hex: String) -> Color:
	var target := Color(target_hex)
	var saturation := clampf(source.s * target.s / 0.52, 0.0, target.s)
	var value := clampf(source.v * target.v, 0.035, target.v)
	return Color.from_hsv(target.h, saturation, value, source.a)


static func _reduce_head_proportions(model: Node3D) -> void:
	var skeleton_nodes := model.find_children("*", "Skeleton3D", true, false)
	if skeleton_nodes.is_empty():
		push_error("The Godot character model has no Skeleton3D for human proportions.")
		return
	var skeleton := skeleton_nodes[0] as Skeleton3D
	var head_bone := skeleton.find_bone("head")
	if head_bone < 0:
		push_error("The Godot character skeleton is missing its head bone.")
		return
	skeleton.set_bone_pose_scale(head_bone, Vector3(0.58, 0.23, 0.60))


static func _add_tie(model: Node3D, look: String) -> void:
	var skeleton_nodes := model.find_children("*", "Skeleton3D", true, false)
	if skeleton_nodes.is_empty():
		return
	var skeleton := skeleton_nodes[0] as Skeleton3D
	var torso_bone := skeleton.find_bone("torso")
	if torso_bone < 0:
		push_error("The Godot character skeleton is missing its torso bone.")
		return
	var attachment := BoneAttachment3D.new()
	attachment.name = "ProfessionalTieAttachment"
	attachment.bone_name = skeleton.get_bone_name(torso_bone)
	skeleton.add_child(attachment)
	var tie_color := Color(str(ROLE_LOOKS[look]["accent"]))
	var tie_material := StandardMaterial3D.new()
	tie_material.albedo_color = tie_color
	tie_material.roughness = 0.82
	var tie := MeshInstance3D.new()
	tie.name = "Tie"
	var tie_mesh := BoxMesh.new()
	tie_mesh.size = Vector3(0.035, 0.075, 0.004)
	tie_mesh.material = tie_material
	tie.mesh = tie_mesh
	tie.position = Vector3(0.0, 0.085, -0.137)
	attachment.add_child(tie)
	var knot := MeshInstance3D.new()
	knot.name = "TieKnot"
	var knot_mesh := BoxMesh.new()
	knot_mesh.size = Vector3(0.04, 0.022, 0.007)
	knot_mesh.material = tie_material
	knot.mesh = knot_mesh
	knot.position = Vector3(0.0, 0.136, -0.137)
	attachment.add_child(knot)
