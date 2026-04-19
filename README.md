🔐 What is Privacy-Mukkiyam_Bigil?
A full-stack cybersecurity system that replaces the traditional blur-based redaction approach with AES-256-GCM selective encryption. Instead of blurring sensitive regions (which AI tools can reverse), Privacy-Mukkiyam-Bigil encrypts the actual pixel data and replaces it with solid black boxes — making the image completely safe to share on WhatsApp or any public channel.

⚙️ How it works:
→ AI detection layer (OCR + OpenCV face detection + YOLOv8) identifies sensitive regions — Aadhaar numbers, PAN cards, UPI IDs, credit card numbers, face photos
→ All EXIF/GPS metadata is stripped before encryption
→ Each sensitive region is individually encrypted with AES-256-GCM using a PBKDF2-derived key (300,000 iterations)
→ The redacted image (black boxes) is safe to share publicly
→ The receiver uploads the image + encrypted metadata file, enters the secret key, and sees the fully restored original

🛡️ Security features built in:
• AES-256-GCM authenticated encryption — tamper-proof
• PBKDF2 key derivation — brute-force resistant
• SHA-256 key hash only stored — raw key never persisted
• Max 3 wrong attempts + 30-second lockout
• Full metadata stripping — zero GPS or device data leaks 
• Black box replacement — nothing to reverse unlike blur

🧱 Tech stack:
React · Flask · Python · OpenCV · Tesseract OCR · YOLOv8 · cryptography (AESGCM) · NumPy · Pillow

This project started from a real problem — millions of people share Aadhaar cards and PAN cards over WhatsApp every day with zero protection. We wanted to build something that actually solves it.
