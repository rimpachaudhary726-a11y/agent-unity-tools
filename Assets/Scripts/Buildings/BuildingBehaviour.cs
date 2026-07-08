using UnityEngine;

namespace CityBuilder.Buildings
{
    /// <summary>
    /// Marker/behaviour for a building placed by the Builder agent.
    /// Kept intentionally simple: visual representation (mesh/prefab
    /// swap) can be layered on later without touching world_state.json's
    /// schema.
    /// </summary>
    public class BuildingBehaviour : MonoBehaviour
    {
        [Tooltip("Optional visual style hint copied from world_state.json properties (e.g. 'brick', 'glass').")]
        public string Style = "default";
    }
}
