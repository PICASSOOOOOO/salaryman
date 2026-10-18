extends RefCounted
## Rebuilds the visible avatar as a rigged, block-built character.

const COLORS := {
	"skin": "#d58c68",
	"skin_shadow": "#b96f50",
	"hair": "#4a2c20",
	"hair_light": "#68402b",
	"hair_dark": "#321f1a",
	"jacket": "#174b86",
	"jacket_light": "#2465a5",
	"jacket_shadow": "#103a6b",
	"shirt": "#f4f0e7",
	"tie": "#17191c",
	"pants": "#28292b",
	"shoe": "#151719",
	"eye": "#202124",
	"eye_white": "#fffaf0",
	"button": "#b7a98a",
}
static func apply(model: Node3D) -> void:
	for node in model.find_children("*", "MeshInstance3D", true, false):
		(node as MeshInstance3D).visible = false
	var skeletons := model.find_children("*", "Skeleton3D", true, false)
	if skeletons.is_empty():
		push_error("Voxel avatar needs the source animated Skeleton3D.")
		return
	var skeleton := skeletons[0] as Skeleton3D
	_add_box(skeleton, "root", Vector3(0, 0.205, 0), Vector3(0.115, 0.105, 0.09), "pants", "waist")
	for side in [-1.0, 1.0]:
		var x: float = side * 0.034
		var limb_bone := "leg-left" if side > 0 else "leg-right"
		var arm_bone := "arm-left" if side > 0 else "arm-right"
		_add_box(skeleton, limb_bone, Vector3(x, 0.112, 0), Vector3(0.05, 0.22, 0.057), "pants", "trouser")
		_add_box(skeleton, limb_bone, Vector3(x, 0.018, 0.018), Vector3(0.058, 0.032, 0.092), "shoe", "shoe")
		_add_box(skeleton, limb_bone, Vector3(x, 0.008, 0.048), Vector3(0.058, 0.012, 0.066), "shoe", "shoe-sole")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.244, 0), Vector3(0.048, 0.17, 0.057), "jacket", "sleeve")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.154, 0.005), Vector3(0.038, 0.034, 0.045), "skin", "hand")
	_add_box(skeleton, "root", Vector3(0, 0.205, 0.002), Vector3(0.095, 0.045, 0.073), "pants", "belt")
	_add_box(skeleton, "root", Vector3(0, 0.205, 0.041), Vector3(0.025, 0.018, 0.006), "shirt", "buckle")
	_add_box(skeleton, "torso", Vector3(0, 0.283, 0), Vector3(0.16, 0.16, 0.086), "jacket", "blazer")
	_add_box(skeleton, "torso", Vector3(-0.052, 0.342, 0), Vector3(0.07, 0.054, 0.092), "jacket_light", "left-shoulder")
	_add_box(skeleton, "torso", Vector3(0.052, 0.342, 0), Vector3(0.07, 0.054, 0.092), "jacket_light", "right-shoulder")
	_add_box(skeleton, "torso", Vector3(0, 0.211, 0), Vector3(0.145, 0.034, 0.088), "jacket_shadow", "jacket-hem")
	_add_box(skeleton, "torso", Vector3(0, 0.285, 0.045), Vector3(0.05, 0.15, 0.01), "shirt", "shirt-front")
	_add_box(skeleton, "torso", Vector3(0, 0.262, 0.052), Vector3(0.024, 0.105, 0.012), "tie", "tie")
	_add_box(skeleton, "torso", Vector3(0, 0.333, 0.055), Vector3(0.026, 0.022, 0.018), "tie", "tie-knot")
	_add_box(skeleton, "torso", Vector3(0, 0.35, 0.047), Vector3(0.064, 0.022, 0.021), "shirt", "collar")
	_add_box(skeleton, "torso", Vector3(-0.052, 0.309, 0.044), Vector3(0.028, 0.022, 0.006), "jacket_shadow", "jacket-pocket")
	for button_y in [0.305, 0.282, 0.259]:
		_add_box(skeleton, "torso", Vector3(0.043, button_y, 0.045), Vector3(0.006, 0.006, 0.004), "button", "jacket-button")
	_add_box(skeleton, "head", Vector3(0, 0.399, 0.052), Vector3(0.08, 0.085, 0.054), "skin", "face")
	_add_box(skeleton, "head", Vector3(0, 0.421, 0.006), Vector3(0.082, 0.045, 0.065), "hair", "hair-cap")
	_add_box(skeleton, "head", Vector3(0, 0.385, 0.067), Vector3(0.08, 0.018, 0.028), "hair", "fringe")
	for side in [-1.0, 1.0]:
		_add_box(skeleton, "head", Vector3(side * 0.039, 0.397, 0.006), Vector3(0.014, 0.032, 0.045), "hair", "side-lock")
		_add_box(skeleton, "head", Vector3(side * 0.041, 0.398, 0.048), Vector3(0.012, 0.024, 0.018), "skin", "ear")
	_add_face_texture(skeleton)
	# Stepped blocks give the hair and shoulders the chunky silhouette in the reference.
	_add_box(skeleton, "head", Vector3(-0.02, 0.447, 0.004), Vector3(0.032, 0.012, 0.05), "hair_light", "hair-step")
	_add_box(skeleton, "head", Vector3(0.021, 0.444, 0.014), Vector3(0.028, 0.012, 0.032), "hair_dark", "hair-step-shadow")
	_add_box(skeleton, "head", Vector3(-0.043, 0.424, 0.004), Vector3(0.012, 0.024, 0.042), "hair_dark", "hair-side-shadow")
	_add_box(skeleton, "head", Vector3(0.02, 0.438, 0.035), Vector3(0.027, 0.012, 0.026), "hair_light", "hair-lock")
	_add_box(skeleton, "head", Vector3(-0.018, 0.432, 0.048), Vector3(0.023, 0.011, 0.022), "hair", "hair-lock")
	_add_box(skeleton, "torso", Vector3(-0.058, 0.359, 0.022), Vector3(0.032, 0.022, 0.09), "jacket_light", "left-lapel")
	_add_box(skeleton, "torso", Vector3(0.058, 0.359, 0.022), Vector3(0.032, 0.022, 0.09), "jacket_light", "right-lapel")
	_add_box(skeleton, "torso", Vector3(-0.07, 0.335, 0.032), Vector3(0.025, 0.054, 0.014), "jacket_shadow", "lapel-shadow")
	for side in [-1.0, 1.0]:
		var arm_bone := "arm-left" if side > 0 else "arm-right"
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.172, 0.03), Vector3(0.049, 0.018, 0.064), "shirt", "shirt-cuff")
		_add_box(skeleton, arm_bone, Vector3(side * 0.102, 0.185, 0.03), Vector3(0.05, 0.012, 0.065), "jacket_shadow", "sleeve-cuff")


static func _add_face_texture(skeleton: Skeleton3D) -> void:
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(Color("#d58c68"))
	_fill_rect(image, 0, 0, 12, 64, Color("#c77e60"))
	_fill_rect(image, 52, 0, 64, 64, Color("#c77e60"))
	_fill_rect(image, 0, 48, 64, 64, Color("#c77e60"))
	_fill_rect(image, 8, 8, 56, 20, Color("#f0bb91"))
	for eye_x in [14, 38]:
		_fill_rect(image, eye_x - 4, 25, eye_x + 5, 29, Color("#fff7e8"))
		_fill_rect(image, eye_x - 1, 25, eye_x + 2, 30, Color("#252327"))
		_fill_rect(image, eye_x - 5, 21, eye_x + 6, 23, Color("#4a2c20"))
	_fill_rect(image, 29, 30, 35, 37, Color("#e5a17b"))
	_fill_rect(image, 32, 35, 36, 38, Color("#b96f50"))
	_fill_rect(image, 24, 44, 40, 46, Color("#8e4c43"))
	_fill_rect(image, 20, 48, 44, 53, Color("#b96f50"))
	var texture := ImageTexture.create_from_image(image)
	var bone_index := skeleton.find_bone("head")
	if bone_index < 0:
		return
	var attachment := BoneAttachment3D.new()
	attachment.name = "Voxel_FaceDetails"
	attachment.bone_name = "head"
	skeleton.add_child(attachment)
	var face := MeshInstance3D.new()
	face.name = "PixelFace"
	var quad := QuadMesh.new()
	quad.size = Vector2(0.062, 0.058)
	face.mesh = quad
	var material := StandardMaterial3D.new()
	material.albedo_texture = texture
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	face.material_override = material
	var target := Transform3D(Basis.IDENTITY, Vector3(0, 0.411, 0.081))
	face.transform = skeleton.get_bone_global_rest(bone_index).affine_inverse() * target
	attachment.add_child(face)


static func _fill_rect(image: Image, x0: int, y0: int, x1: int, y1: int, color: Color) -> void:
	for y in range(y0, y1):
		for x in range(x0, x1):
			image.set_pixel(x, y, color)


static func _add_box(
	skeleton: Skeleton3D,
	bone_name: String,
	center: Vector3,
	size: Vector3,
	color_key: String,
	part_name: String
) -> void:
	var bone_index := skeleton.find_bone(bone_name)
	if bone_index < 0:
		return
	var shape_scale := Vector3(0.67, 1.0, 0.85)
	if bone_name == "head":
		shape_scale.x = 0.9
		shape_scale.z = 1.0
	center *= shape_scale
	size *= shape_scale
	if bone_name == "head":
		center.y += 0.012
		size *= Vector3(0.86, 0.7, 0.9)
	var attachment := BoneAttachment3D.new()
	attachment.name = "Voxel_" + part_name
	attachment.bone_name = bone_name
	skeleton.add_child(attachment)
	var part := MeshInstance3D.new()
	part.name = part_name
	var box := BoxMesh.new()
	box.size = size
	part.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(COLORS[color_key])
	material.roughness = 0.92
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	part.material_override = material
	var target := Transform3D(Basis.IDENTITY, center)
	part.transform = skeleton.get_bone_global_rest(bone_index).affine_inverse() * target
	attachment.add_child(part)
