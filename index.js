const express = require('express')
const cors = require('cors');
require('dotenv').config()
const app = express()
const admin = require("firebase-admin");
const port = process.env.PORT || 3000

app.use(express.json());
app.use(cors());



const serviceAccount = require("./clubverse.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;
    next();
  }
  catch (err) {
    return res.status(401).send({ message: 'unauthorized access' })
  }


}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@lvfahimnuman.wnfazhs.mongodb.net/?appName=LvFahimNuman`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('ClubVerse')
    const userCollection = db.collection('users')
    const managerCollection = db.collection('manager')
    const joinCollection = db.collection('joinMember')
    // Send a ping to confirm a successful connection
    // user Api 
    app.post('/users', async (req, res) => {
      const user = req.body;
      user.role = 'member';
      user.creatAt = new Date()
      const email = user.email
      const exitUser = await userCollection.findOne({ email })
      if (exitUser) {
        return res.send({ message: 'user exists' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
    // club Api 
    app.get('/clubs', async (req, res) => {
      const sort = { membershipFee: -1 }
      const curser = managerCollection.find().sort(sort);
      const result = await curser.toArray();
      res.send(result)
    })
    app.get('/someClubs', async (req, res) => {
      // const sort = { createdAt : -1 }
      const cursor = managerCollection.find().limit(8)
      const result = await cursor.toArray()
      res.send(result)
    })

    app.get('/clubs/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await managerCollection.findOne(query)
      res.send(result)
    })
    // join club Api 
    app.post('/joinMember', async (req, res) => {
      const joinMember = req.body;
      joinMember.createdAt = new Date();
      const { clubId, userEmail } = joinMember;
      // Validate required fields
      if (!clubId || !userEmail) {
        return res.status(400).send({
          message: "clubId and userEmail are required."
        });
      }
      // Step 1: Check if user already joined this club
      const alreadyJoined = await joinCollection.findOne({
        clubId: clubId,
        userEmail: userEmail
      });
      if (alreadyJoined) {
        return res.status(409).send({
          message: "User already joined this club",
          joined: true
        });
      }
      // Step 2: Insert new join
      const result = await joinCollection.insertOne(joinMember);
      res.send(result);
    });
    app.get('/joinMember', verifyFBToken, async (req, res) => {
      const email = req.query.email;

      const query = {};

      if (email) {
        // Check if user own data
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' });
        }
        query.userEmail = email;
      }

      const result = await joinCollection.find(query).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    // manager Api 
    app.post('/manager', async (req, res) => {
      const managers = req.body;
      managers.status = 'pending';
      managers.createdAt = new Date();

      const result = await managerCollection.insertOne(managers);
      res.send(result);
    })
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})