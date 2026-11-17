import { identifyWithPetFace } from "../adapters/petFaceAdapter.mjs";
import { identifyWithPlaceholderSkill } from "./placeholderPetIdentitySkill.mjs";
import { readJson } from "./storage.mjs";

export async function petIdentityRouting(arData) {
  const knownPets = await listKnownPets();
  const identity = await identifyPet(arData, knownPets);

  return {
    skill: "pet-identity-routing",
    ...identity
  };
}

async function identifyPet(arData, knownPets) {
  const forcePetFace = process.env.PET_IDENTITY_PROVIDER === "petface";
  if (forcePetFace) {
    const petFaceIdentity = await identifyWithPetFace(arData, knownPets);
    if (!petFaceIdentity.fallbackUsed) return petFaceIdentity;
  }
  return identifyWithPlaceholderSkill(arData, knownPets);
}

async function listKnownPets() {
  const store = await readJson("pets.json");
  return (store.pets || []).map((pet) => ({
    petId: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    profile: pet.profile || {},
    referenceImages: pet.referenceImages || []
  }));
}
