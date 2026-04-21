from util import aes_help

if __name__ == "__main__":
    """
    可以使用这个工具解密aes加密的base64内容
    修改encrypted_data的值和aes_key即可
    """
    encrypted_data = ""  # TODO: 填入你的加密数据
    aes_key = b""  # TODO: 填入16位AES密钥
    if encrypted_data and aes_key:
        print("解密内容：", aes_help.decrypt_data(aes_help.base64_to_bytes(encrypted_data), aes_key).decode("utf-8"))
    else:
        print("请先设置 encrypted_data 和 aes_key")
