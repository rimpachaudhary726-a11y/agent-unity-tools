using UnityEngine;

namespace CityBuilder.WorldState
{
    /// <summary>
    /// Attached to every GameObject instantiated from world_state.json.
    /// Carries the stable id/type so the Remove agent and loader can find
    /// and reconcile objects without regenerating the whole scene.
    /// </summary>
    public class WorldObjectBehaviour : MonoBehaviour
    {
        public string ObjectId;
        public string ObjectType;
    }
}
