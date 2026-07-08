using UnityEngine;

namespace CityBuilder.Decorations
{
    /// <summary>
    /// Marker/behaviour for a decoration (tree, bench, lamp post, etc.)
    /// placed by the Decorator agent, either standalone or as a child of
    /// a building.
    /// </summary>
    public class DecorationBehaviour : MonoBehaviour
    {
        [Tooltip("Optional decoration kind copied from world_state.json properties (e.g. 'tree', 'bench').")]
        public string Kind = "tree";
    }
}
