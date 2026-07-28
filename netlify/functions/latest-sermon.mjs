export default async () => {
  return new Response(
    JSON.stringify({
      message: "Latest sermon function is working.",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
};