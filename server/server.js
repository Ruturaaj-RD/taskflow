import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT || 5000);

const onListening = () => {
  console.log(`TaskFlow API listening on port ${PORT}`);
};

if (process.env.NODE_ENV === "production") {
  app.listen(PORT, "0.0.0.0", onListening);
} else {
  app.listen(PORT, onListening);
}