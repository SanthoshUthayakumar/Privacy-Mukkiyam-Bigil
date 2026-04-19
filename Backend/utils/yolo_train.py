from ultralytics import YOLO
import yaml
import os

CLASSES = [
    "aadhaar_number", "aadhaar_name", "aadhaar_dob", "aadhaar_address",
    "aadhaar_photo", "aadhaar_qr",
    "pan_number", "pan_name", "pan_dob", "pan_photo",
    "passport_number", "passport_mrz",
    "dl_number", "voter_id_number",
    "payment_upi_id", "payment_amount", "payment_account",
    "payment_ifsc", "payment_name",
    "card_number", "card_cvv", "card_expiry", "card_holder_name",
    "signature",
]

DATASET_ROOT = os.path.join(os.path.dirname(__file__), "..", "datasets")
YAML_PATH    = os.path.join(DATASET_ROOT, "idcard_dataset.yaml")


def create_dataset_yaml():
    """Generate the YOLO dataset YAML config."""
    config = {
        "path": os.path.abspath(DATASET_ROOT),
        "train": "images/train",
        "val":   "images/val",
        "nc":    len(CLASSES),
        "names": CLASSES,
    }
    os.makedirs(DATASET_ROOT, exist_ok=True)
    with open(YAML_PATH, "w") as f:
        yaml.dump(config, f, default_flow_style=False)
    print(f"[✓] Dataset YAML written → {YAML_PATH}")
    return YAML_PATH


def train(
    base_model="yolov8n.pt",   
    epochs=100,
    imgsz=640,
    batch=16,
    patience=20,               # early stopping
    device="cpu",              # use "0" for GPU, "cpu" for CPU
    project="runs/train",
    name="idcard_redact_v1",
):
    yaml_path = create_dataset_yaml()

    print(f"\n[→] Starting training: {name}")
    print(f"    Model   : {base_model}")
    print(f"    Epochs  : {epochs}")
    print(f"    Img size: {imgsz}")
    print(f"    Device  : {device}\n")

    model = YOLO(base_model)

    results = model.train(
        data=yaml_path,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        patience=patience,
        device=device,
        project=project,
        name=name,
        # Augmentation — important for ID card variety
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=5.0,        # slight rotation (cards may be tilted)
        translate=0.1,
        scale=0.3,
        shear=2.0,
        perspective=0.0005,
        flipud=0.0,         # don't flip upside down
        fliplr=0.0,         # don't mirror (text becomes unreadable)
        mosaic=1.0,
        mixup=0.1,
    )

    # Save best weights path
    best = f"{project}/{name}/weights/best.pt"
    print(f"\n[✓] Training complete! Best weights → {best}")
    return best


def validate(weights_path, yaml_path=None):
    """Validate a trained model."""
    model = YOLO(weights_path)
    metrics = model.val(data=yaml_path or YAML_PATH)
    print(f"\n[✓] mAP50   : {metrics.box.map50:.4f}")
    print(f"    mAP50-95: {metrics.box.map:.4f}")
    return metrics


def export_model(weights_path, format="onnx"):
    """Export to ONNX / TFLite / CoreML for deployment."""
    model = YOLO(weights_path)
    model.export(format=format)
    print(f"[✓] Exported to {format}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train YOLOv8 for ID card redaction")
    parser.add_argument("--mode",    default="train",  choices=["train", "val", "export"])
    parser.add_argument("--weights", default="yolov8n.pt")
    parser.add_argument("--epochs",  type=int, default=100)
    parser.add_argument("--imgsz",   type=int, default=640)
    parser.add_argument("--batch",   type=int, default=16)
    parser.add_argument("--device",  default="cpu")
    parser.add_argument("--export-format", default="onnx")
    args = parser.parse_args()

    if args.mode == "train":
        best = train(
            base_model=args.weights,
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=args.device,
        )
    elif args.mode == "val":
        validate(args.weights)
    elif args.mode == "export":
        export_model(args.weights, format=args.export_format)