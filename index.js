const express = require('express')
const cors = require('cors');
require('dotenv').config()
const app = express()
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_KEY);
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
    const PaymentClubCollection = db.collection('paymentClub')
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
    // app.patch('/users/:id',async(req,res)=>{
    //   const id = re
    // })
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

    app.get('/statusClub', async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status
      }
      const cursor = managerCollection.find(query)
      const result = await cursor.toArray()
      res.send(result)
    })
    app.patch('/clubs/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const upDateClub = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          status: upDateClub.status
        }
      };
      const result = await managerCollection.updateOne(query, update);
      res.send(result);
    });
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

      if (!clubId || !userEmail) {
        return res.status(400).send({
          message: "clubId and userEmail are required."
        });
      }
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

      const result = await joinCollection.find(query).sort({ membershipFee: -1 }).toArray();
      res.send(result);
    });

    // club created Api 
    app.get('/joinCreatedClub', verifyFBToken, async (req, res) => {
      const email = req.query.email
      const query = {};
      if (email) {
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' });
        }
        query.managerEmail = email;
      }
      const result = await managerCollection.find(query).sort({ createdAt: -1 }).toArray()
      res.send(result)
    })

    app.patch('/joinCreatedClub/:id', verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const upDateClub = req.body;
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: {
          clubName: upDateClub.clubName,
          category: upDateClub.category,
          membershipFee: upDateClub.membershipFee
        }
      }
      const result = await managerCollection.updateOne(query, update);
      res.send(result)
    })

    // manager Api 
    app.post('/manager', async (req, res) => {
      const managers = req.body;
      managers.status = 'pending';
      managers.createdAt = new Date();

      const result = await managerCollection.insertOne(managers);
      res.send(result);
    })
    app.patch('/manager/:id', verifyFBToken, async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const upDataDoc = {
        $set: {
          status: status
        }
      }
      const result = await managerCollection.updateOne(query, upDataDoc)
      if (status === 'approve') {
        const email = req.body.email;
        const userQuery = { email: email };

        const updateUser = {
          $set: { role: 'manager' }
        };

        await userCollection.updateOne(userQuery, updateUser);
      }
      res.send(result)
    })
    // Stripe Api 
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body;

      const amount = parseInt(paymentInfo.money) * 100;

      try {
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amount,
                product_data: {
                  name: paymentInfo.ClubName,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.userEmail,
          mode: "payment",
          metadata: {
            clubId: paymentInfo.clubId,
            clubName: paymentInfo.ClubName,
            userEmail: paymentInfo.userEmail,
            managerEmail: paymentInfo.managerEmail,
            location: paymentInfo.location,
            membershipFee: paymentInfo.membershipFee,
            status: paymentInfo.status,
            category: paymentInfo.category

          },
          success_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.YOUR_DOMAIN}/dashboard/payment-cancel`,
        });
        console.log(session)
        res.send({ url: session.url });
      } catch (err) {
        console.log(err);
        res.status(500).send({ message: "Stripe session error", error: err });
      }
    });
    app.patch('/payment-success', async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        console.log(sessionId)
        // Retrieve session details from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        // Check if this payment already exists
        const query = { transactionId: transactionId };
        const paymentExist = await PaymentClubCollection.findOne(query);

        if (paymentExist) {
          return res.send({
            message: 'Payment already exists',
            transactionId,
            success: true,
            already: true
          });
        }

        // Payment successful
        if (session.payment_status === 'paid') {

          const paymentDoc = {
            amount: session.amount_total / 100,
            currency: session.currency,
            customerEmail: session.customer_details.email,
            clubId: session.metadata.clubId,
            clubName: session.metadata.clubName,
            transactionId: session.payment_intent,
            paidAt: new Date(),
          };

          // Save the payment data to the main collection
          const resultPayment = await PaymentClubCollection.insertOne(paymentDoc);

          return res.send({
            success: true,
            paymentInfo: resultPayment,
            otherPaymentInfo: resultOther,
            transactionId: transactionId
          });
        }

        return res.send({ success: false, message: "Payment not completed" });

      } catch (error) {
        console.error("Payment verify error:", error);
        res.status(500).send({
          success: false,
          message: "Server error occurred",
          error: error.message
        });
      }
    });
    // verify api 
    app.post("/verify-payment", async (req, res) => {
      const { sessionId } = req.body;

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        return res.send({
          paymentStatus: "paid",
          joinInfo: {
            clubId: session.metadata.clubId,
            clubName: session.metadata.clubName,
            category: session.metadata.category,
            userEmail: session.metadata.userEmail,
            managerEmail: session.metadata.managerEmail,
            location: session.metadata.location,
            membershipFee: session.metadata.membershipFee,
            status: session.metadata.status,
            createdAt: new Date()
          }
        });
      }

      return res.send({ paymentStatus: "cancelled" });
    });

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