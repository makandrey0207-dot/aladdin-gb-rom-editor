#include <QApplication>
#include <QMainWindow>
#include <QMenuBar>
#include <QAction>
#include <QFileDialog>
#include <QMessageBox>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QTextEdit>
#include <QTableWidget>
#include <QHeaderView>
#include <QByteArray>
#include <QFile>
#include <QFileInfo>
#include <QDebug>

namespace {

struct RomInfo {
    QString title;
    QString cartridgeType;
    QString romSize;
    QString ramSize;
    QString mode;
};

QString toHexByte(quint8 value) {
    return QString("%1").arg(value, 2, 16, QChar('0')).toUpperCase();
}

QString toHexOffset(int offset) {
    return QString("0x%1").arg(offset, 4, 16, QChar('0')).toUpperCase();
}

RomInfo parseRomInfo(const QByteArray& rom) {
    RomInfo info;

    if (rom.size() < 0x150) {
        return info;
    }

    QByteArray titleBytes = rom.mid(0x134, 0x10);
    info.title = QString::fromLatin1(titleBytes).trimmed();

    const quint8 cartridgeType = static_cast<quint8>(rom[0x147]);
    const quint8 romSizeCode = static_cast<quint8>(rom[0x148]);
    const quint8 ramSizeCode = static_cast<quint8>(rom[0x149]);
    const quint8 cgbFlag = static_cast<quint8>(rom[0x143]);

    const QHash<int, QString> romSizes = {
        {0x00, "32 KB (no ROM banking)"},
        {0x01, "64 KB (2 banks)"},
        {0x02, "128 KB (4 banks)"},
        {0x03, "256 KB (8 banks)"},
        {0x04, "512 KB (16 banks)"},
        {0x05, "1 MB (32 banks)"},
        {0x06, "2 MB (64 banks)"},
        {0x07, "4 MB (128 banks)"},
        {0x08, "8 MB (256 banks)"},
        {0x52, "1.1 MB (72 banks)"},
        {0x53, "1.2 MB (80 banks)"},
        {0x54, "1.5 MB (96 banks)"}
    };

    const QHash<int, QString> ramSizes = {
        {0x00, "None"},
        {0x01, "2 KB"},
        {0x02, "8 KB"},
        {0x03, "32 KB"},
        {0x04, "128 KB"},
        {0x05, "64 KB"}
    };

    const QHash<int, QString> cartTypes = {
        {0x00, "ROM ONLY"},
        {0x01, "MBC1"},
        {0x02, "MBC1 + RAM"},
        {0x03, "MBC1 + RAM + BATTERY"},
        {0x05, "MBC2"},
        {0x06, "MBC2 + BATTERY"},
        {0x08, "ROM + RAM"},
        {0x09, "ROM + RAM + BATTERY"},
        {0x0F, "MBC3 + TIMER + BATTERY"},
        {0x10, "MBC3 + TIMER + RAM + BATTERY"},
        {0x11, "MBC3"},
        {0x12, "MBC3 + RAM"},
        {0x13, "MBC3 + RAM + BATTERY"},
        {0x19, "MBC5"},
        {0x1A, "MBC5 + RAM"},
        {0x1B, "MBC5 + RAM + BATTERY"},
        {0x1C, "MBC5 + RUMBLE"},
        {0x1D, "MBC5 + RUMBLE + RAM"},
        {0x1E, "MBC5 + RUMBLE + RAM + BATTERY"}
    };

    info.cartridgeType = cartTypes.value(cartridgeType, QString("0x%1").arg(cartridgeType, 2, 16, QChar('0')).toUpperCase());
    info.romSize = romSizes.value(romSizeCode, QString("0x%1").arg(romSizeCode, 2, 16, QChar('0')).toUpperCase());
    info.ramSize = ramSizes.value(ramSizeCode, QString("0x%1").arg(ramSizeCode, 2, 16, QChar('0')).toUpperCase());

    if (cgbFlag == 0x80) {
        info.mode = "CGB supported";
    } else if (cgbFlag == 0xC0) {
        info.mode = "CGB only";
    } else {
        info.mode = "DMG only";
    }

    return info;
}

QTableWidget* createHexTable(const QByteArray& rom) {
    constexpr int bytesPerRow = 16;
    const int rows = (rom.size() + bytesPerRow - 1) / bytesPerRow;

    auto* table = new QTableWidget(rows, 3);
    table->setHorizontalHeaderLabels({"Offset", "Hex", "ASCII"});
    table->horizontalHeader()->setSectionResizeMode(0, QHeaderView::ResizeToContents);
    table->horizontalHeader()->setSectionResizeMode(1, QHeaderView::Stretch);
    table->horizontalHeader()->setSectionResizeMode(2, QHeaderView::Stretch);
    table->verticalHeader()->setVisible(false);
    table->setAlternatingRowColors(true);

    for (int row = 0; row < rows; ++row) {
        const int start = row * bytesPerRow;
        const int end = qMin(start + bytesPerRow, rom.size());

        QString offsetText = toHexOffset(start);
        table->setItem(row, 0, new QTableWidgetItem(offsetText));

        QString hexText;
        QString asciiText;
        for (int i = start; i < end; ++i) {
            const quint8 value = static_cast<quint8>(rom[i]);
            hexText += toHexByte(value) + ' ';

            const QChar ch = (value >= 0x20 && value <= 0x7E) ? QChar(value) : QLatin1Char('.');
            asciiText += ch;
        }

        table->setItem(row, 1, new QTableWidgetItem(hexText.trimmed()));
        table->setItem(row, 2, new QTableWidgetItem(asciiText));
    }

    return table;
}

} // namespace

class RomEditorWindow : public QMainWindow {
public:
    explicit RomEditorWindow(QWidget* parent = nullptr)
        : QMainWindow(parent)
    {
        setWindowTitle("Aladdin GB ROM Editor (C++/Qt)");
        resize(1200, 850);

        auto* central = new QWidget(this);
        auto* rootLayout = new QVBoxLayout(central);

        auto* toolbarLayout = new QHBoxLayout();
        auto* openButton = new QPushButton("Open ROM");
        auto* saveButton = new QPushButton("Save ROM");
        auto* analyzeButton = new QPushButton("Analyze");
        toolbarLayout->addWidget(openButton);
        toolbarLayout->addWidget(saveButton);
        toolbarLayout->addWidget(analyzeButton);

        statusLabel_ = new QLabel("No ROM loaded");
        statusLabel_->setStyleSheet("color: #94a3b8; font-weight: 600;");

        infoLayout_ = new QHBoxLayout();
        titleLabel_ = new QLabel("Title: -");
        cartridgeLabel_ = new QLabel("Cartridge: -");
        sizeLabel_ = new QLabel("Size: -");
        infoLayout_->addWidget(titleLabel_);
        infoLayout_->addWidget(cartridgeLabel_);
        infoLayout_->addWidget(sizeLabel_);

        hexView_ = createHexTable(QByteArray());
        hexView_->setMinimumHeight(400);

        rootLayout->addLayout(toolbarLayout);
        rootLayout->addWidget(statusLabel_);
        rootLayout->addLayout(infoLayout_);
        rootLayout->addWidget(hexView_);

        setCentralWidget(central);

        connect(openButton, &QPushButton::clicked, this, &RomEditorWindow::openRom);
        connect(saveButton, &QPushButton::clicked, this, &RomEditorWindow::saveRom);
        connect(analyzeButton, &QPushButton::clicked, this, &RomEditorWindow::analyzeRom);
    }

private slots:
    void openRom() {
        const QString fileName = QFileDialog::getOpenFileName(this,
            "Open Game Boy ROM",
            QDir::homePath(),
            "Game Boy ROM (*.gb *.gbc *.bin *.rom);;All files (*.*)");

        if (fileName.isEmpty()) {
            return;
        }

        QFile file(fileName);
        if (!file.open(QIODevice::ReadOnly)) {
            QMessageBox::critical(this, "Error", "Unable to open ROM file");
            return;
        }

        romData_ = file.readAll();
        file.close();

        const RomInfo info = parseRomInfo(romData_);
        titleLabel_->setText("Title: " + info.title);
        cartridgeLabel_->setText("Cartridge: " + info.cartridgeType);
        sizeLabel_->setText("Size: " + QString::number(romData_.size()) + " bytes");

        statusLabel_->setText("Loaded: " + QFileInfo(fileName).fileName());
        // Replace the hex view with the parsed data.
        if (hexView_) {
            hexView_->deleteLater();
        }
        hexView_ = createHexTable(romData_);
        hexView_->setMinimumHeight(400);
        centralWidget()->layout()->addWidget(hexView_);
    }

    void saveRom() {
        if (romData_.isEmpty()) {
            QMessageBox::warning(this, "Warning", "No ROM loaded.");
            return;
        }

        const QString fileName = QFileDialog::getSaveFileName(this, "Save ROM", QDir::homePath(), "Game Boy ROM (*.gb *.bin *.rom)");
        if (fileName.isEmpty()) {
            return;
        }

        QFile file(fileName);
        if (!file.open(QIODevice::WriteOnly)) {
            QMessageBox::critical(this, "Error", "Unable to save ROM file");
            return;
        }

        file.write(romData_);
        file.close();
        statusLabel_->setText("Saved: " + QFileInfo(fileName).fileName());
    }

    void analyzeRom() {
        if (romData_.isEmpty()) {
            QMessageBox::warning(this, "Warning", "Load a ROM before analysis.");
            return;
        }

        const RomInfo info = parseRomInfo(romData_);
        QString analysis = QString("Size: %1 bytes\nTitle: %2\nCartridge: %3\nROM: %4\nRAM: %5\nMode: %6")
            .arg(romData_.size())
            .arg(info.title.isEmpty() ? "Unknown" : info.title)
            .arg(info.cartridgeType.isEmpty() ? "Unknown" : info.cartridgeType)
            .arg(info.romSize.isEmpty() ? "Unknown" : info.romSize)
            .arg(info.ramSize.isEmpty() ? "Unknown" : info.ramSize)
            .arg(info.mode.isEmpty() ? "Unknown" : info.mode);

        QMessageBox::information(this, "ROM Analysis", analysis);
    }

private:
    QLabel* statusLabel_ = nullptr;
    QHBoxLayout* infoLayout_ = nullptr;
    QLabel* titleLabel_ = nullptr;
    QLabel* cartridgeLabel_ = nullptr;
    QLabel* sizeLabel_ = nullptr;
    QTableWidget* hexView_ = nullptr;
    QByteArray romData_;
};

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);
    RomEditorWindow window;
    window.show();
    return app.exec();
}
