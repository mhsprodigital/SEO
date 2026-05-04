import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const empSnap = await getDocs(collection(db, 'employees'));
  const emps = empSnap.docs.map(d => d.data());
  console.log("Total Employees:", emps.length);
  
  const unitCounts = {};
  emps.forEach(e => {
    unitCounts[e.unit] = (unitCounts[e.unit] || 0) + 1;
  });
  console.log("Employees per unit:", unitCounts);

  const assignSnap = await getDocs(collection(db, 'assignments'));
  console.log("Total Assignments:", assignSnap.docs.length);
  process.exit(0);
}
run().catch(console.error);
