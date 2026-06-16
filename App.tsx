import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, TouchableWithoutFeedback, Linking, Alert } from 'react-native';

// 👇 LA LIGNE QU'IL FAUT REMETTRE EST CELLE-CI 👇
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

import * as Updates from 'expo-updates';

import Station from './constants/Station';
import Tarif from './constants/Tarif';
import EventCode from './constants/EventCode';
import EventResult from './constants/EventResult';
import packageJson from './package.json';

// ... la suite de ton code (const stationHelper = new Station(); etc...)

const stationHelper = new Station();
const tarifHelper = new Tarif();
const eventCodeHelper = new EventCode();
const eventResultHelper = new EventResult();

const EPOCH = new Date(1997, 0, 1).getTime();

// --- CHAMPS CALYPSO OFFICIELS ---
const CONTRACT_FIELDS = [
  { name: 'NetworkId', bits: 24 }, { name: 'Provider', bits: 8 }, { name: 'Tarif', bits: 16 },
  { name: 'SerialNumber', bits: 32 }, { name: 'CustomerBitmap', bits: 2 }, { name: 'PassengerBitmap', bits: 2 },
  { name: 'VehicleClass', bits: 6 }, { name: 'PaymentPointer', bits: 32 }, { name: 'PayMethod', bits: 11 },
  { name: 'Services', bits: 16 }, { name: 'PriceAmount', bits: 16 }, { name: 'PriceUnit', bits: 16 },
  { name: 'RestrictBitmap', bits: 7 }, { name: 'ValidityBitmap', bits: 9 }, { name: 'JourneyBitmap', bits: 8 },
  { name: 'SaleBitmap', bits: 4 }, { name: 'Status', bits: 8 }, { name: 'LoyaltyPoints', bits: 16 },
  { name: 'Authenticator', bits: 16 }, { name: 'ContractData', bits: 0 },
];

const VALIDITY_FIELDS = [
  { name: 'StartDate', bits: 14 }, { name: 'StartTime', bits: 11 }, { name: 'EndDate', bits: 14 },
  { name: 'EndTime', bits: 11 }, { name: 'Duration', bits: 8 }, { name: 'LimitDate', bits: 14 },
  { name: 'Zones', bits: 8 }, { name: 'Journeys', bits: 16 }, { name: 'PeriodJourneys', bits: 8 },
];

const EVENT_FIELDS = [
  { name: 'DisplayData', bits: 8 }, { name: 'NetworkId', bits: 24 }, { name: 'Code', bits: 8 },
  { name: 'Result', bits: 8 }, { name: 'ServiceProvider', bits: 8 }, { name: 'NotokCounter', bits: 8 },
  { name: 'SerialNumber', bits: 24 }, { name: 'Destination', bits: 16 }, { name: 'LocationId', bits: 16 },
  { name: 'LocationGate', bits: 8 }, { name: 'Device', bits: 16 }, { name: 'RouteNumber', bits: 16 },
  { name: 'RouteVariante', bits: 8 }, { name: 'JourneyRun', bits: 16 }, { name: 'VehicleId', bits: 16 },
  { name: 'VehicleClass', bits: 8 }, { name: 'LocationType', bits: 5 }, { name: 'Employee', bits: 240 },
  { name: 'LocationReference', bits: 16 }, { name: 'JourneyInterchanges', bits: 8 }, { name: 'PeriodJourneys', bits: 16 },
  { name: 'TotalJourneys', bits: 16 }, { name: 'JourneyDistance', bits: 16 }, { name: 'PriceAmount', bits: 16 },
  { name: 'PriceUnit', bits: 16 }, { name: 'ContractPointer', bits: 5 }, { name: 'Authenticator', bits: 16 },
  { name: 'EventDataBitmap', bits: 5 },
];

// --- UTILITAIRES BITS ---
function toBitArray(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

function readBits(bits: number[], offset: number, length: number): number {
  let result = 0;
  for (let i = 0; i < length; i++) result = (result << 1) | (bits[offset + i] ?? 0);
  return result;
}

function getEnabledFields(bitmapValue: number, fields: any[]) {
  const enabled = [];
  let flags = bitmapValue;
  for (let i = 0; i < fields.length; i++) {
    if (flags % 2 === 1) enabled.push(fields[i]);
    flags >>= 1;
  }
  return enabled;
}

function decodeDate(days: number): string {
  if (days === 0) return 'Inconnue';
  const d = new Date(EPOCH + days * 86400000);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function decodeTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}h${m}`;
}

function decodeZones(value: number): string {
  const zones: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((value >> i) & 1) zones.push(i + 1);
  }
  if (zones.length === 0) return '';
  zones.sort((a, b) => a - b);
  return `Zones ${zones[0]}-${zones[zones.length - 1]}`;
}

function hexString(bytes: number[]): string {
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

// --- STRUCTURE DES DONNÉES ---
interface DisplayItem {
  id: string;
  type: 'header' | 'item' | 'subitem' | 'raw';
  text: string;
  devInfo?: string;
}

export default function App() {
  const [log, setLog] = useState<string>('Prêt à scanner.');
  const [dataList, setDataList] = useState<DisplayItem[]>([]);
  const [rawLogs, setRawLogs] = useState<string[]>([]);

  const [isDevMode, setIsDevMode] = useState(false);
  const [tapCount, setTapCount] = useState(0); // 👈 Le nouveau compteur

  // La fonction du Secret Tap
  const handleTitlePress = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    
    if (newCount >= 10) {
      setIsDevMode(!isDevMode); // Active ou désactive le mode
      setTapCount(0); // Réinitialise le compteur
    }
  };

  // --- SYSTÈME DE MISE À JOUR OTA ---
  useEffect(() => {
    async function checkForUpdates() {
      try {
        // 1. On demande au serveur s'il y a du nouveau
        const update = await Updates.checkForUpdateAsync();
        
        if (update.isAvailable) {
          // 2. Si oui, on affiche une belle pop-up native
          Alert.alert(
            "✨ Nouvelle version disponible !",
            "Une mise à jour de Paname Scanner est prête. Veux-tu l'installer maintenant ?",
            [
              { 
                text: "Plus tard", 
                style: "cancel" 
              },
              { 
                text: "Mettre à jour", 
                onPress: async () => {
                  setLog("Téléchargement de la mise à jour...");
                  // 3. On télécharge le nouveau code
                  await Updates.fetchUpdateAsync();
                  // 4. On redémarre l'application instantanément
                  await Updates.reloadAsync();
                }
              }
            ]
          );
        }
      } catch (error) {
        // Si le téléphone n'a pas de réseau, on ignore silencieusement
        console.log("Erreur de vérification MAJ :", error);
      }
    }
    
    // On lance la fonction
    checkForUpdates();
  }, []);

  // Intercepte les erreurs de longueur (6C XX) et renvoie la requête avec la bonne taille
  async function transceiveWithLengthAutoCorrection(cmd: number[]): Promise<number[]> {
    let resp = await NfcManager.isoDepHandler.transceive(cmd);
    if (resp.length >= 2 && resp[resp.length - 2] === 0x6C) {
      const correctLength = resp[resp.length - 1];
      const correctedCmd = [...cmd];
      correctedCmd[correctedCmd.length - 1] = correctLength;
      resp = await NfcManager.isoDepHandler.transceive(correctedCmd);
    }
    return resp;
  }
  // --- SCAN INTELLIGENT (Lecture ciblée et rapide) ---
  async function scanPass() {
    setLog('Analyse en cours...');
    setDataList([]);
    setRawLogs([]);
    const extracted: DisplayItem[] = [];
    const hexDump: string[] = [];

    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      
      const tag = await NfcManager.getTag();
      if (tag && tag.id) hexDump.push(`Tag UID: ${tag.id}`);

      let cla = 0x00;
      let isFlatMemory = false;
      let supportType = "Inconnu";
      
      let resp = await NfcManager.isoDepHandler.transceive([0x94, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
      if (resp[resp.length - 2] === 0x90) { cla = 0x94; supportType = "Passe Rigide"; }
      
      if (supportType === "Inconnu") {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
        if (resp[resp.length - 2] === 0x90) supportType = "Navigo Easy (Light)";
      }

      if (supportType === "Inconnu") {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x00, 0x00, 0x02, 0x20, 0x00]);
        if (resp[resp.length - 2] === 0x90) supportType = "Passe Rigide";
      }

      if (supportType === "Inconnu") {
         isFlatMemory = true;
         supportType = "Passe Souple";
      }

      extracted.push({ id: 'ok', type: 'item', text: '✅ Support détecté', devInfo: `Type : ${supportType}` });

      async function readRecord(sfi: number, fileId: number[], record: number): Promise<number[] | null> {
         try {
            // MÉTHODE 1 : Lecture directe via le numéro SFI (La méthode infaillible de ton Dump)
            // L'astuce c'est que ton 'cla' est déjà à 0x00 pour les cartes souples, et 0x94 pour les rigides !
            const p2 = (sfi << 3) | 4;
            let readResp = await transceiveWithLengthAutoCorrection([cla, 0xB2, record, p2, 0x1D]);
            
            // Si la carte a bien répondu avec les données
            if (readResp && readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
               return readResp;
            }

            // MÉTHODE 2 : Fallback par sélection du fichier (A4) si la lecture directe a échoué
            // On tente l'ancienne méthode au cas où, pour garantir une compatibilité maximale
            if (!isFlatMemory && fileId && fileId.length === 2) {
               const selResp = await transceiveWithLengthAutoCorrection([cla, 0xA4, 0x00, 0x00, 0x02, ...fileId]);
               if (selResp && selResp.length > 1 && selResp[selResp.length - 2] === 0x90) {
                  readResp = await transceiveWithLengthAutoCorrection([cla, 0xB2, record, 0x04, 0x1D]);
                  if (readResp && readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
                     return readResp;
                  }
               }
            }
         } catch (e) {
            // Silence des erreurs pour ne pas crasher la boucle globale
         }
         return null;
      }

      // ENVIRONNEMENT
      const envData = await readRecord(1, [0x20, 0x01], 1);
      if (envData) {
          hexDump.push(`Env (SFI 1): ${hexString(envData)}`);
          const bits = toBitArray(envData.slice(0, -2));
          let pos = 6;
          const bitmap = readBits(bits, pos, 7); pos += 7;
          
          let passNum = "Inconnu";
          let logicalNum = "Inconnu";
          let endDate = "Inconnue";
          
          if ((bitmap >> 6) & 1) pos += 24;
          if ((bitmap >> 5) & 1) pos += 8;
          if ((bitmap >> 4) & 1) { 
             logicalNum = readBits(bits, pos, 32).toString(); pos += 32; 
             if (tag && tag.id) {
                const idHex = tag.id.length > 8 ? tag.id.substring(tag.id.length - 8) : tag.id;
                passNum = parseInt(idHex, 16).toString().padStart(10, '0');
             } else passNum = logicalNum;
          }
          if ((bitmap >> 3) & 1) pos += 14;
          if ((bitmap >> 2) & 1) { endDate = decodeDate(readBits(bits, pos, 14)); pos += 14; }
          
          extracted.push({ id: 'h-env', type: 'header', text: '[ENVIRONNEMENT]' });
          extracted.push({ id: 'd-env', type: 'item', text: `Numéro : ${passNum}\nExpire le : ${endDate}`, devInfo: `App Logic: ${logicalNum} | Tag UID: ${tag ? tag.id : 'N/A'}` });
      } else if (isFlatMemory) {
          const sfi2Rec1 = await readRecord(2, [0x20, 0x20], 1);
          let bscNum = "Inconnu";
          if (sfi2Rec1) {
              const data = sfi2Rec1.slice(0, -2);
              let offset = (data[0] === 0x00 && data[1] === 0x00) ? 16 : 0;
              if (data.length >= offset + 4) {
                 const val = (data[offset] << 24) | (data[offset+1] << 16) | (data[offset+2] << 8) | data[offset+3];
                 bscNum = (val >>> 0).toString().padStart(10, '0');
              }
          }
          extracted.push({ id: 'h-env', type: 'header', text: '[IDENTIFICATION]' });
          extracted.push({ id: 'd-env', type: 'item', text: `Numéro du ticket : ${bscNum}`, devInfo: `Lu sur SFI 2.` });
      }

      // CONTRATS
      extracted.push({ id: 'h-cont', type: 'header', text: '[CONTRATS]' });
      let hasContracts = false;
      
      // 👈 CORRECTION : Le bon dossier SFI selon le type de carte
      const targetSfiContracts = isFlatMemory ? 2 : 9; 
      
      for (let i = 1; i <= 4; i++) {
         const contData = await readRecord(targetSfiContracts, [0x20, 0x20], i);
         if (contData) {
            // ... (ne change rien à la suite de ce bloc)
            hexDump.push(`Contrat (SFI 2, Rec ${i}): ${hexString(contData)}`);
            const data = contData.slice(0, -2);
            if (!data.every(b => b === 0 || b === 255)) {
              const bits = toBitArray(data);
              let pos = (isFlatMemory && data[0] === 0x00 && data[1] === 0x00) ? 128 : 0;
              const bitmapValue = readBits(bits, pos, 20); pos += 20;
              const enabledFields = getEnabledFields(bitmapValue, CONTRACT_FIELDS);
              const fields: any = {};
              for (const field of enabledFields) {
                if (field.bits === 0) continue;
                fields[field.name] = readBits(bits, pos, field.bits); pos += field.bits;
                if (field.name === 'ValidityBitmap') {
                  const valEnabled = getEnabledFields(fields['ValidityBitmap'], VALIDITY_FIELDS);
                  for (const vf of valEnabled) { fields[vf.name] = readBits(bits, pos, vf.bits); pos += vf.bits; }
                }
              }
              
              const isValidContract = (fields.Tarif && fields.Tarif !== 0) || (isFlatMemory && i === 1);
              
              if (isValidContract) {
                 hasContracts = true;
                 const tarifName = fields.Tarif ? (tarifHelper.getTarif(fields.Tarif) || `Code Tarif: ${fields.Tarif}`) : "Ticket t+";
                 
                 let detailsList = [];
                 
                 if (!isFlatMemory) {
                    if (fields.PriceAmount) detailsList.push(`${(fields.PriceAmount / 100).toFixed(2).replace('.', ',')} €`);
                    let nbJourneys = fields.Journeys;
                    if (nbJourneys !== undefined && nbJourneys > 255) nbJourneys = nbJourneys & 0xFF;
                    if (nbJourneys !== undefined) detailsList.push(nbJourneys === 0 ? '❌ Épuisé' : `🎫 ${nbJourneys} trajet(s)`);
                 }
                 
                 if (fields.Zones) detailsList.push(decodeZones(fields.Zones));
                 if (fields.StartDate && fields.EndDate) detailsList.push(`Du ${decodeDate(fields.StartDate)} au ${decodeDate(fields.EndDate)}`);
                 else if (fields.StartDate) detailsList.push(`À partir du ${decodeDate(fields.StartDate)}`);
                 
                 const details = detailsList.join(' - ');
                 extracted.push({ id: `c-${i}`, type: 'item', text: `- ${tarifName}`, devInfo: `Tarif ID: ${fields.Tarif || 'ABSENT'}` });
                 if (details) extracted.push({ id: `cs-${i}`, type: 'subitem', text: `↳ ${details}` });
              }
            }
         }
      }
      if (!hasContracts) extracted.push({ id: 'c-none', type: 'item', text: "- Aucun contrat décodable." });

      // --- 4 & 5. LECTURE DES VALIDATIONS ET INCIDENTS ---
      extracted.push({ id: 'h-val', type: 'header', text: '[VALIDATIONS]' });
      
      const validationsList: DisplayItem[] = [];
      const incidentsList: DisplayItem[] = [];
      const seenEvents = new Set<string>();

      // 👈 CORRECTION : On a retiré le "7" de la liste des passes rigides
      const targets = isFlatMemory ? [3, 4] : [3, 8, 4, 29]; 

      for (const sfi of targets) {
         // ... (ne change rien à la suite)
         const isSpecialFile = (sfi === 4 || sfi === 29); // Le fameux "Casier judiciaire"
         const fileId = isSpecialFile ? [0x20, 0x11] : [0x20, 0x10];

         for (let i = 1; i <= 3; i++) {
            const valData = await readRecord(sfi, fileId, i);
            
            if (valData) {
               const data = valData.slice(0, -2);
               if (!data.every(b => b === 0)) {
                  const bits = toBitArray(data);
                  let pos = 0;
                  const dateStamp = readBits(bits, pos, 14); pos += 14;
                  const timeStamp = readBits(bits, pos, 11); pos += 11;
                  
                  if (dateStamp > 1000 && dateStamp < 16000 && timeStamp < 1440) {
                     // VARIABLES CORRIGÉES ICI :
                     let code: number | undefined = undefined;
                     let locationId: number | undefined = undefined;
                     let result: number | undefined = undefined;

                     if (data.length > 5) {
                        pos = 25; 
                        const bitmapValue = readBits(bits, pos, 28); pos += 28;
                        const enabledFields = getEnabledFields(bitmapValue, EVENT_FIELDS);
                        
                        const fields: any = {};
                        for (const field of enabledFields) {
                          if (field.bits === 0) continue;
                          fields[field.name] = readBits(bits, pos, field.bits);
                          pos += field.bits;
                        }

                        // AFFECTATION CORRECTE :
                        code = fields.Code;
                        result = fields.Result; 
                        locationId = fields.LocationId;
                     }

                     // Filtre anti-doublons absolu
                     const eventKey = `${dateStamp}-${timeStamp}-${code || 0}`;
                     if (seenEvents.has(eventKey)) continue;
                     seenEvents.add(eventKey);

                     const timeText = `Le ${decodeDate(dateStamp)} à ${decodeTime(timeStamp)}`;
                     // On utilise "code ?? 0" pour garantir qu'un nombre est envoyé à la fonction
                    const stationStr = locationId !== undefined ? stationHelper.getStation(code ?? 0, locationId) || '' : '';
                     
                     // Traduction de l'action tentée
                    const eventStr = code !== undefined ? eventCodeHelper.getEventCode(code) || `Action (0x${code.toString(16).toUpperCase()})` : 'Validation';

                    // Traduction de la raison de l'incident
                    const resultStr = result !== undefined ? eventResultHelper.getEventResult(result) : undefined;

                    // Logique d'affichage corrigée
                    if (isSpecialFile || (result && result !== 0)) { 
                      const reason = resultStr || `Code erreur inconnu (0x${result?.toString(16)})`;
                      
                      incidentsList.push({ id: `inc-${sfi}-${i}`, type: 'item', text: `- ⚠️ ${eventStr}`, devInfo: `SFI ${sfi} Ligne ${i} | Code: ${code} Res: ${result}` });
                      incidentsList.push({ id: `incs-${sfi}-${i}`, type: 'subitem', text: `↳ Incident : ${reason}\n↳ Station : ${stationStr}\n↳ ${timeText}` });
                    } else {
                      validationsList.push({ id: `val-${sfi}-${i}`, type: 'item', text: `- ✅ ${eventStr}`, devInfo: `SFI ${sfi} Ligne ${i}` });
                      validationsList.push({ id: `vals-${sfi}-${i}`, type: 'subitem', text: stationStr ? `↳ Station : ${stationStr}\n↳ ${timeText}` : `↳ ${timeText}` });
                    }
                  }
               }
            }
         }
      }

      if (validationsList.length > 0) extracted.push(...validationsList);
      else extracted.push({ id: 'v-none', type: 'item', text: "- Aucune trace de validation." });

      extracted.push({ id: 'h-inc', type: 'header', text: '[INCIDENTS / CONTRÔLES]' });
      if (incidentsList.length > 0) extracted.push(...incidentsList);
      else extracted.push({ id: 'inc-none', type: 'item', text: "- Aucun incident enregistré." });

      setDataList(extracted);
      setRawLogs(hexDump);
      setLog("Extraction terminée !");
    } catch (ex) {
      setLog(`Erreur technique :\n${String(ex)}`);
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
  }

  // --- LE DUMPER INTÉGRAL (BRUTE-FORCE) ---
  async function dumpPass() {
    setLog('Dump intégral en cours... Gardez la carte IMMOBILE (≈ 5 sec) !');
    setDataList([{ id: 'dump-info', type: 'header', text: '⚠️ [DUMP MÉMOIRE BRUTE EN COURS]' }]);
    setRawLogs([]);
    const hexDump: string[] = [];

    try {
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      
      const tag = await NfcManager.getTag();
      if (tag && tag.id) hexDump.push(`Tag UID: ${tag.id}\n`);

      let cla = 0x00;
      let resp = await NfcManager.isoDepHandler.transceive([0x94, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
      if (resp[resp.length - 2] === 0x90) cla = 0x94;
      else {
        resp = await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x04, 0x00, 0x08, 0x31, 0x54, 0x49, 0x43, 0x2E, 0x49, 0x43, 0x41, 0x00]);
        if (resp[resp.length - 2] !== 0x90) {
           await NfcManager.isoDepHandler.transceive([0x00, 0xA4, 0x00, 0x00, 0x02, 0x20, 0x00]);
        }
      }

      hexDump.push("--- DÉBUT DE L'EXTRACTION COMPLÈTE ---");

      for (let sfi = 1; sfi <= 30; sfi++) {
        let p2 = (sfi << 3) | 4;
        let foundSomethingInSFI = false;

        for (let rec = 1; rec <= 10; rec++) {
           try {
             const readResp = await NfcManager.isoDepHandler.transceive([cla, 0xB2, rec, p2, 0x1D]);
             
             if (readResp.length > 2 && readResp[readResp.length - 2] === 0x90) {
                if (!foundSomethingInSFI) {
                   hexDump.push(`\n[ Fichier SFI ${sfi} ]`);
                   foundSomethingInSFI = true;
                }
                hexDump.push(`Ligne ${rec} : ${hexString(readResp)}`);
             } else {
                break;
             }
           } catch (e) {
             break;
           }
        }
      }

      hexDump.push("\n--- FIN DU DUMP ---");
      setRawLogs(hexDump);
      setDataList([
         { id: 'dump-ok', type: 'item', text: '✅ Dump terminé avec succès.' },
         { id: 'dump-desc', type: 'subitem', text: 'Toute la mémoire cachée du passe a été extraite ci-dessous.' }
      ]);
      setLog("Dump terminé ! Vous pouvez retirer la carte.");

    } catch (ex) {
      setLog(`Erreur de Dump :\n${String(ex)}`);
    } finally {
      NfcManager.cancelTechnologyRequest();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Le titre est maintenant cliquable secrètement */}
        <TouchableWithoutFeedback onPress={handleTitlePress}>
          <Text style={styles.title}>🚇 Paname Scanner</Text>
        </TouchableWithoutFeedback>
        
        {/* On affiche juste un petit texte si le mode Dev est actif, sinon rien n'apparaît */}
        {isDevMode && (
          <View style={styles.devToggleContainer}>
            <Text style={styles.devToggleLabel}>🛠 Actif</Text>
          </View>
        )}
      </View>

      <Text style={styles.statusText}>{log}</Text>

      <TouchableOpacity style={styles.button} onPress={scanPass}>
        <Text style={styles.buttonText}>SCANNER LE PASSE</Text>
      </TouchableOpacity>

      {isDevMode && (
        <TouchableOpacity style={styles.dumpButton} onPress={dumpPass}>
          <Text style={styles.dumpButtonText}>🔴 DUMP INTÉGRAL DE LA PUCE</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={styles.dataBox} showsVerticalScrollIndicator={false}>
        {dataList.map((item) => (
          <View key={item.id}>
            <Text style={item.type === 'header' ? styles.headerText : item.type === 'subitem' ? styles.subText : styles.dataText}>
              {item.text}
            </Text>
            {isDevMode && item.devInfo && <Text style={styles.devInlineText}>{item.devInfo}</Text>}
          </View>
        ))}

        {isDevMode && rawLogs.length > 0 && (
          <View style={styles.rawLogContainer}>
            <Text style={styles.headerText}>[DONNÉES BRUTES (HEX)]</Text>
            <Text style={styles.rawLogText} selectable={true}>{rawLogs.join('\n')}</Text>
          </View>
          )}

        {/* --- LE FOOTER AVEC NUMÉRO DE VERSION DYNAMIQUE --- */}
        <View style={styles.footer}>
          {/* On récupère la version depuis app.json */}
          <Text style={styles.versionText}>
            VERSION {packageJson.version}
          </Text>

          <Text style={styles.footerText}>
            Basé sur les travaux originaux de NavigoReader.
          </Text>
          {/* ... suite du footer ... */}
          <Text style={styles.footerText}>
            Créé à l'aide de <Text style={styles.geminiG}>G</Text><Text style={styles.geminiE}>e</Text><Text style={styles.geminiM}>m</Text><Text style={styles.geminiI1}>i</Text><Text style={styles.geminiN}>n</Text><Text style={styles.geminiI2}>i</Text> ✨
          </Text>
          
          <TouchableOpacity onPress={() => Linking.openURL('mailto:contact@grandpaname.fun')}>
            <Text style={styles.contactText}>contact@grandpaname.fun</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 50, backgroundColor: '#0B0C10', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 20 },
  title: { fontSize: 22, color: '#66FCF1', fontWeight: 'bold' },
  devToggleContainer: { flexDirection: 'row', alignItems: 'center' },
  devToggleLabel: { color: '#C5C6C7', marginRight: 8, fontSize: 12, fontWeight: 'bold' },
  statusText: { color: '#888', fontSize: 14, marginBottom: 15, textAlign: 'center' },
  button: { backgroundColor: '#45A29E', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 8, marginBottom: 10, width: '100%', alignItems: 'center' },
  buttonText: { color: '#0B0C10', fontWeight: 'bold', fontSize: 16 },
  dumpButton: { backgroundColor: '#2C1010', paddingVertical: 12, paddingHorizontal: 40, borderRadius: 8, marginBottom: 20, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#FF4D4D' },
  dumpButtonText: { color: '#FF9999', fontWeight: 'bold', fontSize: 14 },
  dataBox: { flex: 1, width: '100%', borderTopWidth: 1, borderColor: '#1F2833', paddingTop: 10 },
  headerText: { color: '#66FCF1', fontWeight: 'bold', fontSize: 16, marginTop: 15, marginBottom: 5 },
  dataText: { color: '#C5C6C7', fontSize: 14, marginBottom: 4, paddingLeft: 10 },
  subText: { color: '#888', fontSize: 13, marginBottom: 8, paddingLeft: 25, fontStyle: 'italic' },
  devInlineText: { color: '#F3E5AB', fontFamily: 'monospace', fontSize: 11, paddingLeft: 25, marginBottom: 8 },
  rawLogContainer: { marginTop: 30, padding: 10, backgroundColor: '#1F2833', borderRadius: 8, marginBottom: 40 },
  // ... (tes styles existants)
  rawLogText: { color: '#45A29E', fontFamily: 'monospace', fontSize: 10, lineHeight: 18 },
  
  // --- STYLES DU FOOTER ---
  footer: { marginTop: 40, paddingVertical: 20, borderTopWidth: 1, borderColor: '#1F2833', alignItems: 'center', paddingBottom: 40 },
  versionText: { color: '#45A29E', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, marginBottom: 12 }, 
  footerText: { color: '#888', fontSize: 12, marginBottom: 5, textAlign: 'center', fontStyle: 'italic' },
  contactText: { color: '#66FCF1', fontSize: 13, textDecorationLine: 'underline', marginTop: 8, fontWeight: 'bold' }, // 👈 AJOUT ICI
  
  // Couleurs stylisées Gemini
  geminiG: { color: '#4285F4', fontWeight: 'bold', fontStyle: 'normal' },
  geminiE: { color: '#8E24AA', fontWeight: 'bold', fontStyle: 'normal' },
  geminiM: { color: '#C2185B', fontWeight: 'bold', fontStyle: 'normal' },
  geminiI1: { color: '#E53935', fontWeight: 'bold', fontStyle: 'normal' },
  geminiN: { color: '#FDD835', fontWeight: 'bold', fontStyle: 'normal' },
  geminiI2: { color: '#00897B', fontWeight: 'bold', fontStyle: 'normal' },
});