import cv2

def redact_image(image, boxes):
    for box in boxes:
        x, y, w, h = box["x"], box["y"], box["w"], box["h"]

    
        image[y:y+h, x:x+w] = (0, 0, 0)

    return image