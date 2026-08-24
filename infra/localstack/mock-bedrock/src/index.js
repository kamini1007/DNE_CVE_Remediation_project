const { createApp } = require('./server');

const PORT = parseInt(process.env.PORT || '4010', 10);

const app = createApp();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-bedrock] listening on port ${PORT} - this is a local stand-in for AWS Bedrock, NOT real AI`);
});
