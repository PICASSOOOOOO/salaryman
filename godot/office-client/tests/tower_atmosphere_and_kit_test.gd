extends SceneTree

const AtmosphereProfile = preload("res://atmosphere_profile.gd")
const Client = preload("res://main.gd")
const Service = preload("res://office_service_prop.gd")
var failures := 0


func _initialize() -> void:
	call_deferred("_run")


func check(value: bool, message: String) -> void:
	if not value:
		failures += 1
		push_error(message)


func _run() -> void:
	var healthy_mix := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 100, "cleanliness": 100}],
	})
	var worn_mix := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 55, "cleanliness": 45}],
	})
	var degraded_mix := AtmosphereProfile.deterioration_mix({
		"objects": [{"condition": 0, "cleanliness": 0}],
		"basement": {"building": {
			"powerCondition": 0,
			"plumbingCondition": 0,
			"upkeepCondition": 0,
		}},
	})
	var missing_mix := AtmosphereProfile.deterioration_mix({"objects": []})
	check(is_equal_approx(healthy_mix, 0.0), "Healthy surfaces must preserve the solar baseline")
	check(is_equal_approx(worn_mix, 0.5), "Surface wear must blend proportionally")
	check(is_equal_approx(degraded_mix, 1.0), "Fully degraded state must reach the cyberpunk grade")
	check(is_equal_approx(missing_mix, 0.0), "Missing maintenance data must not imply deterioration")

	var solar_profile: Dictionary = AtmosphereProfile.profile(0.0)
	var cyber_profile: Dictionary = AtmosphereProfile.profile(1.0)
	check(solar_profile["ambient_color"] != cyber_profile["ambient_color"], "Ambient light must shift with persisted condition")
	check(solar_profile["rim_color"] != cyber_profile["rim_color"], "Degraded rim light must gain restrained magenta")
	check(float(cyber_profile["ambient_energy"]) < float(solar_profile["ambient_energy"]), "Degraded ambience must deepen shadows")

	var atm := Service.create_service("atm")
	var atm_art := atm.get_node_or_null("ApprovedKitArtwork") as Sprite3D
	check(atm_art != null and atm_art.texture != null, "ATM must display its submitted kit image")
	if atm_art != null and atm_art.texture != null:
		check(atm_art.texture.resource_path.ends_with("atm.png"), "ATM must use its matching kit image")
	atm.free()

	var vending := Service.create_service("vending_machine")
	var vending_art := vending.get_node_or_null("ApprovedKitArtwork") as Sprite3D
	check(vending_art != null and vending_art.texture != null, "Vending must display its submitted kit image")
	if vending_art != null and vending_art.texture != null:
		check(vending_art.texture.resource_path.ends_with("vending.png"), "Vending must use its matching kit image")
	vending.free()

	var client := Client.new()
	client._build_lighting()
	client.atmosphere_target_mix = 1.0
	for _frame in range(300):
		client._update_art_motion(1.0 / 60.0)
	check(client.atmosphere_mix > 0.95, "Lighting must ease toward the snapshot atmosphere")
	var current_profile: Dictionary = AtmosphereProfile.profile(client.atmosphere_mix)
	check(client.atmosphere_environment.ambient_light_color == current_profile["ambient_color"], "WorldEnvironment must track the interpolated grade")
	check(client.rim_light.light_color == current_profile["rim_color"], "Rim lighting must track the interpolated grade")
	client.free()

	print("Tower atmosphere and kit checks: ", "PASS" if failures == 0 else "FAIL (%d)" % failures)
	quit(0 if failures == 0 else 1)
