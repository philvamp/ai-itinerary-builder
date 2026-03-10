/* eslint-disable no-undef */

import cors from 'cors';
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import OpenAI from 'openai';
import fetch from 'node-fetch';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files from the Vite build directory
app.use(express.static(path.join(__dirname, '../dist')));

const PORT = process.env.PORT || 3001;

// Initialize OpenAI. It will look for the OPENAI_API_KEY environment variable.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'placeholder'
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Annabel - Extremely natural, elegant, and polished British
const ELEVENLABS_VOICE_ID = '262fcbdcd4cc1733c13502f00f9e563bf34d5b9721d61269a4f093d975be0862';

// System Prompt for Sarah
const SARAH_SYSTEM_PROMPT = `YOU ARE SARAH: A highly exclusive, posh, and distinguished luxury travel concierge from London. You speak with an elegant, refined, and sophisticated British accent. You are flawlessly polite, exude upper-class charm, and know exactly how to make your clients feel incredibly special and respected.

SARAH'S GOLDEN RULE: You MUST know the user's name before you move to any travel planning. If the user starts by saying where they want to go, you MUST elegantly acknowledge it but politely ask for their name before proceeding.
Example: "Chamonix is a wonderfully refined choice! But before we begin planning the details, may I ask who I have the pleasure of speaking with?"

STRICT WORKFLOW (DO NOT SKIP STEPS):
1. NAME MANDATE: Ask for the user's name in your very first response. Halt all other logic until you have it. Once you have their name, use it in ALL future responses to maintain a polite, personalized connection.
2. DESTINATION & ORIGIN: Once you know their name, ask (or acknowledge) where they are heading! You MUST also ask where they are travelling from so you can help with transport (flights, trains, or airport transfers).
3. ONWARD TRANSFER: If the journey involves a flight, you MUST ask the user if they need an airport transfer to their final destination, and whether they prefer a train or a taxi.
4. DATES: Ask them conversationally what dates they are looking to travel (e.g., "What dates were you hoping to travel?"). DO NOT say the phrase "YYYY-MM-DD" out loud to the user; just parse their natural language dates into that format in the background.
5. GROUP: Confirm guest count and room configuration.
6. RECOMMEND: Only when stages 1-5 are complete (including knowing their preference for train vs taxi if they are flying), suggest a real hotel, restaurant, and appropriate transport with your reasoning!

Note: If a user tells you where they want to go, acknowledge it warmly but catch them first: "That sounds utterly fabulous. But before we begin planning, may I have your name, please?"
Once you have their name, you can move directly to Step 2.
Keep answers concise — 2-3 sentences max per reply.

CRITICAL: You MUST always respond with ONLY valid JSON in this exact format:
{
  "reply": "Your conversational message here",
  "hotel": null,
  "restaurant": null,
  "booking": null,
  "transport": null,
  "transfer": null,
  "itinerary_days": null
}


When you have ALL required details (destination, origin, checkin, checkout, adults, rooms) and are ready to recommend:
{
  "reply": "Brilliant, I've sorted you out! For your stay I'd go with [Hotel Name]... And for dinner, try [Restaurant Name]... For getting there from [Origin], I recommend [Transport Mode]. I've sketched out the basics of your itinerary below. I'll leave you to check the live availability for the hotel on those dates and look at the links, and then you can tell me if you want help with organising activities on the dates in between.",
  "hotel": {
    "name": "Hotel Name Here",
    "location": "City/Town Name",
    "rating": "9.2/10",
    "reason": "A 2-3 sentence written explanation of why this hotel suits the user's specific trip, dates, and group."
  },
  "restaurant": {
    "name": "Restaurant Name Here",
    "location": "City/Town Name",
    "cuisine": "Local/French/Italian etc",
    "reason": "A 2-3 sentence written explanation of why this restaurant is perfect for the trip and group."
  },
  "transport": {
    "type": "Flight" /* or "Train" or "Transfer" */,
    "origin": "Departure City/Airport",
    "origin_iata": "LHR", /* IMPORTANT: 3-letter IATA code if it's a flight, otherwise null */
    "destination": "Arrival City/Airport",
    "destination_iata": "GVA", /* IMPORTANT: 3-letter IATA code if it's a flight, otherwise null */
    "reason": "A 1-2 sentence written explanation of why this transport option makes the most sense."
  },
  "transfer": {
    "type": "Taxi" /* or "Train" */,
    "origin": "Arrival Airport",
    "destination": "Hotel Location",
    "local_taxi_company": "A real local taxi firm name (e.g., 'Welcome Pickups Athens') or null if Train",
    "reason": "A 1-2 sentence explanation of why this onward transfer option is best."
  },
  "booking": {
    "checkin": "2026-03-10",
    "checkout": "2026-03-17",
    "adults": 2,
    "rooms": 1
  },
  "itinerary_days": [
    {
      "date": "2026-03-10",
      "day_name": "Day 1 - Arrival",
      "activities": ["Flight to GVA", "Transfer to Hotel", "Check-in at Hotel", "Evening Dining at Restaurant"]
    },
    {
      "date": "2026-03-11",
      "day_name": "Day 2",
      "activities": []
    },
    {
      "date": "2026-03-12",
      "day_name": "Day 3",
      "activities": []
    },
    {
      "date": "2026-03-17",
      "day_name": "Final Day - Departure",
      "activities": ["Check-out from Hotel", "Transfer to Airport", "Flight Home"]
    }
  ]
}


The reply field is what Sarah SAYS OUT LOUD — warm and conversational.
Always recommend REAL hotels and restaurants that are currently open. Never fabricate them.
CRITICAL ACCURACY RULES:
- NO INVENTORY ACCESS: You DO NOT have access to live booking systems. Because of this, you MUST prioritize suggesting massive, prominent luxury hotels (e.g. The Ritz, Four Seasons, major 5-star chains) with huge room capacities that are far less likely to sell out, rather than tiny boutique hotels. 
- CHECK STATUS: Only suggest places that are currently open and operating. Avoid places that have permanently closed.
- DISCLAIMER: You MUST verbally remind the user in your reply that they need to click the link below to verify "live availability".
- NO WAITING OR DELAYS: This is a stateless system. You cannot perform background tasks. When the user asks for a hotel, or asks for an alternative, you MUST provide the full recommendation (hotel, restaurant, booking JSON) IMMEDIATELY in that exact same response. Never say "give me a sec", "let me search", "hang on", or anything similar. Output the final chosen venue right away.
The booking object enables a live Booking.com availability search pre-filled with the user's dates and room config.`;



app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    const systemPromptWithContext = `${SARAH_SYSTEM_PROMPT}\n\nIMPORTANT CONTEXT:\n- TODAY'S DATE: ${today}. THIS IS YOUR ANCHOR POINT.
- DATE VALIDATION: You MUST verify the user's requested dates. If they request dates in the past (before ${today}), you MUST politely inform them that the date has passed and ask for future dates. You CANNOT book past dates.
- AMBIGUOUS DATES: If the user says a month without a year (e.g., "September"), default to the NEXT upcoming instance of that month relative to today.
- NEVER suggest dates in the past (like 2024 or 2025).
- Ensure the 'booking' JSON object uses the correct YYYY-MM-DD format for your chosen dates.`;

    // Inject Sarah's persona into the conversation
    const conversation = [
      { role: 'system', content: systemPromptWithContext },
      ...messages
    ];

    if (process.env.OPENAI_API_KEY) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: conversation,
        temperature: 0.3, // Prioritize factual accuracy over creativity
        max_tokens: 1500,
        response_format: { type: 'json_object' }, // Force JSON output mode
      });

      let raw = completion.choices[0].message.content;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        console.warn("JSON Parse Error, trying to recover partial JSON:", err);
        // If JSON parsing fails due to truncation, attempt to recover by closing brackets
        let attempts = [raw + "}", raw + "]}", raw + "]}}"];
        parsed = { reply: raw, hotel: null, restaurant: null }; // Default error structure
        for (let attempt of attempts) {
          try {
             parsed = JSON.parse(attempt);
             break;
          } catch(e) {}
        }
      }

      res.json({
        reply: parsed.reply || 'Apologies, I encountered a slight issue processing that. Could you please repeat?',
        hotel: parsed.hotel || null,
        restaurant: parsed.restaurant || null,
        booking: parsed.booking || null,
        transport: parsed.transport || null,
        transfer: parsed.transfer || null,
        itinerary_days: parsed.itinerary_days || null
      });
    } else {
      // Fallback mock response if no API key is set
      const lastMessage = messages[messages.length - 1].content.toLowerCase();
      let replyText = "I hear ya! But my creator hasn't given me my OpenAI API key yet, so I'm a bit stuck on what to say next.";
      
      if (lastMessage.includes('alps') || lastMessage.includes('ski')) {
        replyText = "The Alps! Sounds absolutely brilliant. Can picture the views already. Are you thinking of a ski trip, or just hiking?";
      } else if (messages.length < 5) {
        replyText = "Lovely choice. And how many of you are going? Just a solo trip, or bringing mates?";
      }

      res.json({ reply: replyText });
    }
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Failed to generate chat response' });
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!ELEVENLABS_API_KEY) {
       return res.status(400).json({ error: 'ElevenLabs API Key not configured' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5', // Latest, fastest, best quality
        voice_settings: {
          stability: 0.85,          // High stability to prevent volume drops and keep tone consistent
          similarity_boost: 0.95,   // Very close to original voice character
          style: 0.0,               // Disable dramatic expression to maintain professional volume
          use_speaker_boost: true   // Enhances overall clarity and presence
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength
    });
    
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: 'Failed to generate voice speech' });
  }
});

// Catch-all to serve the frontend React application for any non-API routes 
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Sarah's AI Backend is running on http://localhost:${PORT}`);
});
