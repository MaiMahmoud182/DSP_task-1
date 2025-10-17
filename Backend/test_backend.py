import requests
import json

def test_backend():
    base_url = "http://localhost:5000"
    
    # Test health endpoint
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/api/health")
        print(f"Health check: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"Health check failed: {e}")
        return
    
    # Test upload with a sample file
    print("\nTesting upload endpoint...")
    files = {
        'ecg_file': ('test.csv', '0.1,0.2,0.15\n0.12,0.22,0.17\n0.11,0.21,0.16', 'text/csv')
    }
    data = {'sampling_rate': 360}
    
    try:
        response = requests.post(f"{base_url}/api/upload-ecg", files=files, data=data)
        print(f"Upload test: {response.status_code}")
        if response.status_code == 200:
            print("Upload successful!")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Upload failed: {response.text}")
    except Exception as e:
        print(f"Upload test failed: {e}")

if __name__ == "__main__":
    test_backend()