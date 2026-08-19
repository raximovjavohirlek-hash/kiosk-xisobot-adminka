import os
import sys
import pandas as pd
import openpyxl
from datetime import datetime

# Pochta (email) -> Kassa/Stansiya nomi mapping
EMAIL_TO_STATION = {
    "toshkent.shimoliykiosk@railway.uz": "Тошкент Марказий",
    "kiosk@axonlogic.uz": "Тошкент Жанубий",
    "samarqandkiosk@railway.uz": "Самарқанд",
    "urganchkiosk@railway.uz": "Урганч",
    "khivakiosk@railway.uz": "Хива",
    "navoiykiosk@railway.uz": "Навои",
    "buxorokiosk@railway.uz": "Бухоро",
    "qongirotkiosk@railway.uz": "Қўнғирод",
    "nukuskiosk@railway.uz": "Нукус",
    "andijonkiosk@railway.uz": "Андижон",
    "qoqonkiosk@railway.uz": "Қўқон",
    "margilonkiosk@railway.uz": "Марғилон",
    "namangankiosk@railway.uz": "Наманган",
    "termizkiosk@railway.uz": "Термиз",
    "qarshikiosk@railway.uz": "Қарши"
}

def analyze_export(file_path):
    """
    Adminkadan yuklangan Excel faylini o'qish va pochtalar bo'yicha guruhlash
    """
    print(f"Fayl o'qilmoqda: {file_path}")
    df = pd.read_excel(file_path)
    print("Fayldagi ustunlar:", list(df.columns))
    print(df.head())
    return df

if __name__ == "__main__":
    if len(sys.argv) > 1:
        analyze_export(sys.argv[1])
    else:
        print("Fayl yo'li berilmadi. Foydalanish: python process_admin_export.py <adminka_excel_fayli.xlsx>")
