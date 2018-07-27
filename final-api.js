var StellarSdk = require('stellar-sdk');
var request = require('request');
var express = require('express');
var app = express();
StellarSdk.Network.usePublicNetwork();

var bodyParser = require('body-parser');
app.use(bodyParser.json({type: 'application/json'}));


// Create key pair
var createKeyPair = express.Router();

createKeyPair.get('/', function(req, res){
  var server = new StellarSdk.Server('https://horizon.stellar.org');
  
  var pair = StellarSdk.Keypair.random();
  var secret_key = pair.secret();
  var public_key = pair.publicKey();
  
  console.log("Secret key: "+secret_key);
  console.log("Public key: "+public_key); 
  
  var keyPair = {'secret': secret_key, 'public': public_key};
   
  res.contentType('application/json');
  res.end(JSON.stringify(keyPair));
});
app.use('/keypair', createKeyPair);


// Get Balance
var getBal = express.Router();
getBal.post('/', function(request, res){
    var server = new StellarSdk.Server('https://horizon.stellar.org');  //For Mainnet
    var balanceList = [];

    public_key = request.body.public_address;
    server.loadAccount(public_key).then(function(account) {
        console.log('Balances for account: ' + public_key);
        
        account.balances.forEach(function(balance) {
            console.log('Type:', balance.asset_type, ', Balance:', balance.balance);
            var singleBalance = {};
            singleBalance['currency'] = balance.asset_code;
            singleBalance['Balance'] = balance.balance;
            balanceList.push(singleBalance);
        });
        res.contentType('application/json');
        res.end(JSON.stringify(balanceList));
    });
});
app.use('/balance', getBal);


// Send Transaction => Stellar
var sendTx = express.Router();
sendTx.post('/', function(request, response){

  var server = new StellarSdk.Server('https://horizon.stellar.org');

  var senderSecret = request.body.secret_key;
  var destinationId = request.body.receiver_key;  
  var currencyAmount = request.body.amount;

  var sourceKeys = StellarSdk.Keypair
  .fromSecret(senderSecret);

  var transaction;

  server.loadAccount(destinationId)
  // If the account is not found, surface a nicer error message for logging.
  .catch(StellarSdk.NotFoundError, function (error) {
      throw new Error('The destination account does not exist!');
  })
  // If there was no error, load up-to-date information on your account.
  .then(function() {
      console.log(sourceKeys.publicKey());
      return server.loadAccount(sourceKeys.publicKey());
  })
  .then(function(sourceAccount) {
      // Start building the transaction.
      transaction = new StellarSdk.TransactionBuilder(sourceAccount)
      .addOperation(StellarSdk.Operation.payment({
          destination: destinationId,
          asset: StellarSdk.Asset.native(),
          amount: currencyAmount
      }))
      .addMemo(StellarSdk.Memo.text('Test Transaction'))
      .build();
      // Sign the transaction to prove you are actually the person sending it.
      transaction.sign(sourceKeys);
      // And finally, send it off to Stellar!
      return server.submitTransaction(transaction);
  })
  .then(function(result) {
      console.log('Success! Results:', result);
      response.contentType('application/json');
      response.end(JSON.stringify(result));
  })
  .catch(function(error) {
      console.error('Something went wrong!', error);
  });

});
app.use('/sendTransaction', sendTx);

// Create Token

var createToken = express.Router();
createToken.post('/', function(request, response){
  var server = new StellarSdk.Server('https://horizon.stellar.org');
  
  var issuingSecret = request.body.issuing_key; 
  var distributingSecret = request.body.distributing_key;
  var totolSupply = request.body.supply;

  // Keys for accounts to issue and receive the new asset
  var issuingKeys = StellarSdk.Keypair.fromSecret(issuingSecret);
  var receivingKeys = StellarSdk.Keypair.fromSecret(distributingSecret);

  // Create an object to represent the new asset
  var ccc = new StellarSdk.Asset('CCC', issuingKeys.publicKey());

  // First, the receiving account must trust the asset
  server.loadAccount(receivingKeys.publicKey())
    .then(function(receiver) {
      var transaction = new StellarSdk.TransactionBuilder(receiver)
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: ccc,
        }))
        .build();
      transaction.sign(receivingKeys);
      return server.submitTransaction(transaction);
    })

    // Second, the issuing account actually sends a payment using the asset
    .then(function() {
      return server.loadAccount(issuingKeys.publicKey())
    })
    .then(function(issuer) {
      var transaction = new StellarSdk.TransactionBuilder(issuer)
        .addOperation(StellarSdk.Operation.payment({
          destination: receivingKeys.publicKey(),
          asset: ccc,
          amount: totolSupply
        }))
        .build();
      transaction.sign(issuingKeys);
      return server.submitTransaction(transaction);
    })
    .then(function(result) {
      console.log('Success! Results:', result);
      response.contentType('application/json');
      response.end(JSON.stringify(result));
    })
    .catch(function(error) {
      console.error('Error!', error);
    });

});
app.use('/create-token', createToken);


// Send Token 

var sendToken = express.Router();
sendToken.post('/', function(req,res,next){
  console.log("Something went wrong here")
    var server = new StellarSdk.Server('https://horizon.stellar.org');

    var sourceKey = req.body.source_keys;
    console.log("this is source key" ,sourceKey)
    
    var issuingKeys = StellarSdk.Keypair.fromSecret(req.body.issuing_keys);
    console.log("this is distributor key" ,issuingKeys)
    
    var receivingKeys = req.body.receiving_keys;
    console.log("this is receive key" ,receivingKeys)
    
    
    var ccc = new StellarSdk.Asset('CCC',sourceKey);
   
    server.loadAccount(receivingKeys)
    .then(function(account) {
        var trusted = account.balances.some(function(balance) {
        console.log(balance);
        return balance.asset_code === 'CCC' && balance.asset_issuer === sourceKey;
        });
        if(trusted===true){
            console.log('trusted')
            server.loadAccount(issuingKeys.publicKey())
            .then(function(issuer) {
                var transaction = new StellarSdk.TransactionBuilder(issuer)
                .addOperation(StellarSdk.Operation.payment({
                    destination: receivingKeys,
                    asset: ccc,
                    amount: req.body.amount
                }))
                .build();
                transaction.sign(issuingKeys);
                return server.submitTransaction(transaction);
            })
            .then(function(result) {
                console.log('Success! Results:', result);
                res.send(JSON.stringify(result));
            })
            .catch(function(error) {
                console.error('Error!', error);
            });
        }
        else{
            console.log('not trusted')
        }
    });
});
app.use('/send-token', sendToken);


// Check Trust
var checkTrust = express.Router();
checkTrust.post('/', function (request, response){

  var server = new StellarSdk.Server('https://horizon.stellar.org');

  var ccc = 'CCC';
  var mkjIssuer = 'GCJ5FI4Z4GEJIZAURWS6XKM22ZV2T4BPXKVY522DCZHCWP5OQTXX53VQ';

  var accountId = request.body.account_id;
  server.loadAccount(accountId)
  .then(function(account) {
    var trusted = account.balances.some(function(balance) {
      console.log(balance);
      return balance.asset_code === ccc && balance.asset_issuer === mkjIssuer;
    })
    if(trusted){
      response.contentType('application/json');
      response.end(JSON.stringify("Trusted"));
    }
    else{
      response.contentType('application/json');
      response.end(JSON.stringify("Not Trusted"));
    }
  })
  .catch(function(error) {
    console.error('Error!', error);
    response.contentType('application/json');
    response.end(JSON.stringify(error));
  });
});
app.use('/check-trust', checkTrust);


// Make Trust
var makeTrust = express.Router();
makeTrust.post('/', function (request, response){
  var server = new StellarSdk.Server('https://horizon.stellar.org');

  // source account of the token
  var sourceKey = 'GCJ5FI4Z4GEJIZAURWS6XKM22ZV2T4BPXKVY522DCZHCWP5OQTXX53VQ'; 

  // account which is making trust with the token
  var investorkey = request.body.investor_key;
  var receivingKeys = StellarSdk.Keypair.fromSecret(investorkey);

  var ccc = new StellarSdk.Asset('CCC', sourceKey);

  // change trust and submit transaction
  server.loadAccount(receivingKeys.publicKey())
    .then(function(receiver) {
      var transaction = new StellarSdk.TransactionBuilder(receiver)
        .addOperation(StellarSdk.Operation.changeTrust({
          asset: ccc,
          //limit: '1000'
        }))
        .build();
      transaction.sign(receivingKeys);
      return server.submitTransaction(transaction);
    })
    .then(function(result) {
      console.log('Success! Results:', result);
      response.contentType('application/json');
      response.end(JSON.stringify("Trust Generated"));
    })
    .catch(function(error) {
      console.error('Error!', error);
      response.contentType('application/json');
      response.end(JSON.stringify("Trust Not Generated"));
    });

});
app.use('/make-trust', makeTrust);


//Generate Pool address for Bitcoin Cash
var bchAddress = express.Router();
bchAddress.get('/', function(request, response){

    const bch = require('bitcoincashjs');
    const privateKey = new bch.PrivateKey();
    const addr = privateKey.toAddress();

    const Address = bch.Address;
    const BitpayFormat = Address.BitpayFormat;
    const CashAddrFormat = Address.CashAddrFormat;

    const address = new Address(addr);

    var public_key = address.toString(CashAddrFormat);
    var secret_key = privateKey.toString();    
    
    console.log("Public Key: "+ public_key);
    console.log("Secret Key: "+ secret_key);

    var keyPair = {'secret': secret_key, 'public': public_key};

    response.contentType('application/json');
    response.end(JSON.stringify(keyPair));
})
app.use('/bch-address', bchAddress);


//Generate Pool address for Ethereum

var ethAddress = express.Router();
ethAddress.get('/', function(request, response){
    const Web3 = require("web3");
    const web3 = new Web3();

    var Web3EthAccounts = require('web3-eth-accounts');
    web3.setProvider(new web3.providers.HttpProvider("https://rinkeby.infura.io/metamask"));
    var account = new Web3EthAccounts('http://rinkeby.infura.io/t2utzUdkSyp5DgSxasQX');
    var account = account.create();

    console.log(account);

    response.contentType('application/json');
    response.end(JSON.stringify(account));
});
app.use('/eth-address', ethAddress);

// Check validation
var checkAddr = express.Router();
checkAddr.post('/', function (request, response){

  var server = new StellarSdk.Server('https://horizon.stellar.org');

  var accountId = request.body.addr;
  console.log("the adress is",accountId);

  server.loadAccount(accountId)
  .catch(StellarSdk.NotFoundError, function (error) {
   // response.contentType('application/json');
    response.end(JSON.stringify("unvalid")); 
  })
  .then(function() {
   // response.contentType('application/json');
    response.end(JSON.stringify("valid"));
  })
});
app.use('/check-addr', checkAddr);


// Listening port 3000
if (module === require.main) {
    // Start the server
    var server = app.listen(process.env.PORT || 3000, function () {
        var port = server.address().port;
        console.log('App listening on port %s', port);
    });
  }
  module.exports = app;