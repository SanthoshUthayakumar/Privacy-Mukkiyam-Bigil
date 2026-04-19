import requests

url = "http://localhost:5000/process"

files = {"image": open("test.jpg", "rb")}

response = requests.post(url, files=files)

print("Status Code:", response.status_code)
print("Raw Response:")
print(response.text)