export const handleError = (
  res: {
    status: (arg0: number) => { json: (arg0: { error: string }) => void };
  },
  error: unknown,
  message: string,
) => {
  console.error(message, error);
  res.status(400).json({ error: message });
};
