using System.Collections.Generic;
using System.IO;
using UnityEngine;
using CityBuilder.Buildings;
using CityBuilder.Decorations;
using CityBuilder.Interiors;

namespace CityBuilder.WorldState
{
    /// <summary>
    /// Reads world_state.json and reconciles the live scene against it:
    /// existing objects are matched by id and updated in place, missing
    /// ids are instantiated, and objects no longer present in the document
    /// are removed. This keeps the scene additive/persistent rather than
    /// rebuilding everything from scratch on every change.
    /// </summary>
    public class WorldStateLoader : MonoBehaviour
    {
        [Tooltip("Path to world_state.json, relative to the project root.")]
        public string WorldStatePath = "world_state.json";

        private readonly Dictionary<string, GameObject> _liveObjects = new Dictionary<string, GameObject>();

        public void Reconcile()
        {
            string fullPath = Path.Combine(Application.dataPath, "..", WorldStatePath);
            if (!File.Exists(fullPath))
            {
                Debug.LogWarning($"[WorldStateLoader] No world_state.json found at {fullPath}");
                return;
            }

            string json = File.ReadAllText(fullPath);
            WorldStateDocument doc = JsonUtility.FromJson<WorldStateDocument>(json);
            if (doc == null)
            {
                Debug.LogError("[WorldStateLoader] Failed to parse world_state.json");
                return;
            }

            var seenIds = new HashSet<string>();
            foreach (WorldObject obj in doc.objects)
            {
                ReconcileObject(obj, transform, seenIds);
            }

            // Remove any live object whose id no longer exists in the document.
            var toRemove = new List<string>();
            foreach (var kvp in _liveObjects)
            {
                if (!seenIds.Contains(kvp.Key))
                {
                    toRemove.Add(kvp.Key);
                }
            }

            foreach (string id in toRemove)
            {
                if (_liveObjects.TryGetValue(id, out GameObject go) && go != null)
                {
                    Destroy(go);
                }
                _liveObjects.Remove(id);
            }
        }

        private void ReconcileObject(WorldObject obj, Transform parent, HashSet<string> seenIds)
        {
            seenIds.Add(obj.id);

            if (!_liveObjects.TryGetValue(obj.id, out GameObject go) || go == null)
            {
                go = new GameObject(obj.id);
                go.transform.SetParent(parent, false);

                WorldObjectBehaviour marker = go.AddComponent<WorldObjectBehaviour>();
                marker.ObjectId = obj.id;
                marker.ObjectType = obj.type;

                switch (obj.type)
                {
                    case "building":
                        go.AddComponent<BuildingBehaviour>();
                        break;
                    case "tree":
                    case "decoration":
                        go.AddComponent<DecorationBehaviour>();
                        break;
                }

                _liveObjects[obj.id] = go;
            }

            go.transform.localPosition = new Vector3(obj.position.x, obj.position.y, obj.position.z);
            go.transform.localScale = new Vector3(obj.scale.x, obj.scale.y, obj.scale.z);

            if (obj.type == "building" && obj.interior != null)
            {
                InteriorBehaviour interiorBehaviour = go.GetComponent<InteriorBehaviour>();
                if (interiorBehaviour == null)
                {
                    interiorBehaviour = go.AddComponent<InteriorBehaviour>();
                }
                interiorBehaviour.Apply(obj.interior);
            }

            foreach (WorldObject child in obj.children)
            {
                ReconcileObject(child, go.transform, seenIds);
            }
        }
    }
}
