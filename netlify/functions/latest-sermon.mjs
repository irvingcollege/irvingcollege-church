export default async () => {
  const buildHook = process.env.SERMON_BUILD_HOOK;

  if (!buildHook) {
    console.error("SERMON_BUILD_HOOK is not configured.");
    return;
  }

  try {
    const response = await fetch(buildHook, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        `Build hook returned ${response.status}`
      );
    }

    console.log("Weekly sermon rebuild triggered.");
  } catch (error) {
    console.error(
      "Could not trigger sermon rebuild:",
      error
    );
  }
};

export const config = {
  schedule: "0 12 * * 1",
};