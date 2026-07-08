using System.IO;
using NUnit.Framework;
using UnityEngine;
using CityBuilder.WorldState;

namespace CityBuilder.EditorTests
{
    /// <summary>
    /// EditMode tests run by the unity-test-runner GitHub Actions workflow.
    /// They exercise real Unity compilation (this file must compile) and do
    /// a lightweight sanity check that world_state.json is present and
    /// well-formed. This is intentionally NOT a full simulation -- deep
    /// gameplay checks are out of scope for the compile-check loop.
    /// </summary>
    public class WorldStateValidationTests
    {
        private static string WorldStatePath =>
            Path.Combine(Application.dataPath, "..", "world_state.json");

        [Test]
        public void WorldStateFile_Exists()
        {
            Assert.IsTrue(File.Exists(WorldStatePath), "world_state.json must exist at the project root.");
        }

        [Test]
        public void WorldStateFile_ParsesIntoDocument()
        {
            string json = File.ReadAllText(WorldStatePath);
            WorldStateDocument doc = JsonUtility.FromJson<WorldStateDocument>(json);

            Assert.IsNotNull(doc, "world_state.json failed to parse into a WorldStateDocument.");
            Assert.IsNotNull(doc.objects, "world_state.json must contain an 'objects' array.");
        }

        [Test]
        public void WorldStateObjects_HaveIdAndType()
        {
            string json = File.ReadAllText(WorldStatePath);
            WorldStateDocument doc = JsonUtility.FromJson<WorldStateDocument>(json);

            foreach (WorldObject obj in doc.objects)
            {
                Assert.IsFalse(string.IsNullOrEmpty(obj.id), "Every world object must have a non-empty id.");
                Assert.IsFalse(string.IsNullOrEmpty(obj.type), $"Object '{obj.id}' must have a non-empty type.");
            }
        }
    }
}
