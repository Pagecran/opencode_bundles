#include "PagecranBridgeServer.h"

#include "Containers/Ticker.h"
#include "Dom/JsonObject.h"
#include "IPAddress.h"
#include "JsonObjectConverter.h"
#include "Policies/CondensedJsonPrintPolicy.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "SocketSubsystem.h"
#include "Sockets.h"
#include "Common/TcpListener.h"
#include "PagecranBridgeMethodRegistry.h"

namespace
{
    TSharedPtr<FJsonObject> MakeEventMessage(const FString& EventName, const TSharedPtr<FJsonObject>& Data)
    {
        TSharedPtr<FJsonObject> Message = MakeShared<FJsonObject>();
        Message->SetStringField(TEXT("type"), TEXT("event"));
        Message->SetStringField(TEXT("name"), EventName);
        Message->SetNumberField(TEXT("ts"), static_cast<double>(FDateTime::UtcNow().ToUnixTimestamp()) * 1000.0);
        Message->SetObjectField(TEXT("data"), Data.IsValid() ? Data : MakeShared<FJsonObject>());
        return Message;
    }

    FString SerializeJsonLine(const TSharedPtr<FJsonObject>& Object)
    {
        FString Payload;
        TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> Writer =
            TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Payload);
        FJsonSerializer::Serialize(Object.ToSharedRef(), Writer);
        Payload.AppendChar(TEXT('\n'));
        return Payload;
    }
}

FPagecranBridgeServer::FPagecranBridgeServer(FPagecranBridgeMethodRegistry* InMethodRegistry)
    : MethodRegistry(InMethodRegistry)
{
}

FPagecranBridgeServer::~FPagecranBridgeServer()
{
    Stop();
}

bool FPagecranBridgeServer::Start(const FString& InHost, int32 InPort)
{
    Stop();

    Host = InHost;
    Port = InPort;

    FIPv4Address ListenAddress;
    if (!FIPv4Address::Parse(InHost, ListenAddress))
    {
        UE_LOG(LogTemp, Error, TEXT("OpenCodeUnrealBridge: invalid host '%s'"), *InHost);
        return false;
    }

    Listener = MakeUnique<FTcpListener>(FIPv4Endpoint(ListenAddress, static_cast<uint16>(InPort)));
    if (!Listener.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("OpenCodeUnrealBridge: failed to create TCP listener"));
        return false;
    }

    Listener->OnConnectionAccepted().BindRaw(this, &FPagecranBridgeServer::HandleConnectionAccepted);
    TickHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateRaw(this, &FPagecranBridgeServer::Tick), 0.01f);
    bRunning = true;

    UE_LOG(LogTemp, Display, TEXT("OpenCodeUnrealBridge listening on %s:%d"), *Host, Port);
    return true;
}

void FPagecranBridgeServer::Stop()
{
    if (TickHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
        TickHandle.Reset();
    }

    for (FClientConnection& Client : Clients)
    {
        if (Client.Socket != nullptr)
        {
            Client.Socket->Close();
            ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(Client.Socket);
            Client.Socket = nullptr;
        }
    }
    Clients.Reset();

    Listener.Reset();
    bRunning = false;
}

bool FPagecranBridgeServer::IsRunning() const
{
    return bRunning;
}

FString FPagecranBridgeServer::GetHost() const
{
    return Host;
}

int32 FPagecranBridgeServer::GetPort() const
{
    return Port;
}

bool FPagecranBridgeServer::HandleConnectionAccepted(FSocket* ClientSocket, const FIPv4Endpoint& ClientEndpoint)
{
    if (ClientSocket == nullptr)
    {
        return false;
    }

    ClientSocket->SetNoDelay(true);

    FClientConnection& Client = Clients.AddDefaulted_GetRef();
    Client.Socket = ClientSocket;
    Client.Endpoint = ClientEndpoint.ToString();

    TSharedPtr<FJsonObject> Data = MakeShared<FJsonObject>();
    Data->SetStringField(TEXT("endpoint"), Client.Endpoint);
    Data->SetStringField(TEXT("host"), Host);
    Data->SetNumberField(TEXT("port"), Port);
    BroadcastEvent(TEXT("bridge_status"), Data);

    return true;
}

bool FPagecranBridgeServer::Tick(float DeltaTime)
{
    TArray<int32> Disconnected = CollectDisconnectedClientIndexes();

    for (int32 Index = 0; Index < Clients.Num(); ++Index)
    {
        if (Disconnected.Contains(Index))
        {
            continue;
        }
        if (!ReceiveFromClient(Clients[Index]))
        {
            Disconnected.Add(Index);
        }
    }

    if (Disconnected.Num() > 0)
    {
        RemoveClients(Disconnected);
    }

    return true;
}

bool FPagecranBridgeServer::ReceiveFromClient(FClientConnection& Client)
{
    if (Client.Socket == nullptr)
    {
        return false;
    }

    uint32 PendingSize = 0;
    while (Client.Socket->HasPendingData(PendingSize))
    {
        const int32 ReceiveSize = static_cast<int32>(FMath::Min<uint32>(PendingSize, 65536));
        TArray<uint8> Buffer;
        Buffer.SetNumUninitialized(ReceiveSize + 1);

        int32 BytesRead = 0;
        if (!Client.Socket->Recv(Buffer.GetData(), ReceiveSize, BytesRead) || BytesRead <= 0)
        {
            return false;
        }

        Buffer[BytesRead] = 0;
        Client.Buffer += UTF8_TO_TCHAR(reinterpret_cast<const char*>(Buffer.GetData()));
        ProcessClientBuffer(Client);
    }

    return Client.Socket->GetConnectionState() == ESocketConnectionState::SCS_Connected;
}

void FPagecranBridgeServer::ProcessClientBuffer(FClientConnection& Client)
{
    while (true)
    {
        int32 NewlineIndex = INDEX_NONE;
        if (!Client.Buffer.FindChar(TEXT('\n'), NewlineIndex))
        {
            break;
        }

        FString RawMessage = Client.Buffer.Left(NewlineIndex).TrimStartAndEnd();
        Client.Buffer = Client.Buffer.Mid(NewlineIndex + 1);
        if (!RawMessage.IsEmpty())
        {
            DispatchMessage(Client, RawMessage);
        }
    }
}

void FPagecranBridgeServer::DispatchMessage(FClientConnection& Client, const FString& RawMessage)
{
    TSharedPtr<FJsonObject> Request;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawMessage);
    if (!FJsonSerializer::Deserialize(Reader, Request) || !Request.IsValid())
    {
        SendError(Client, TEXT(""), TEXT("Invalid JSON request"));
        return;
    }

    const FString Type = Request->GetStringField(TEXT("type"));
    const FString Id = Request->GetStringField(TEXT("id"));
    if (Type != TEXT("request"))
    {
        SendError(Client, Id, TEXT("Unsupported message type"));
        return;
    }

    const FString Method = Request->GetStringField(TEXT("method"));
    const TSharedPtr<FJsonObject>* ParamsPtr = nullptr;
    TSharedPtr<FJsonObject> Params = MakeShared<FJsonObject>();
    if (Request->TryGetObjectField(TEXT("params"), ParamsPtr) && ParamsPtr != nullptr && ParamsPtr->IsValid())
    {
        Params = *ParamsPtr;
    }

    TSharedPtr<FJsonObject> Result;
    FString ErrorMessage;
    if (MethodRegistry == nullptr || !MethodRegistry->Execute(Method, Params, Result, ErrorMessage))
    {
        SendError(Client, Id, ErrorMessage.IsEmpty() ? TEXT("Request failed") : ErrorMessage);
        return;
    }

    SendResult(Client, Id, Result.IsValid() ? Result : MakeShared<FJsonObject>());
}

void FPagecranBridgeServer::SendResult(FClientConnection& Client, const FString& Id, const TSharedPtr<FJsonObject>& Result) const
{
    TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
    Response->SetStringField(TEXT("type"), TEXT("result"));
    Response->SetStringField(TEXT("id"), Id);
    Response->SetObjectField(TEXT("result"), Result.IsValid() ? Result : MakeShared<FJsonObject>());
    SendJson(Client, Response);
}

void FPagecranBridgeServer::SendError(FClientConnection& Client, const FString& Id, const FString& ErrorMessage) const
{
    TSharedPtr<FJsonObject> Response = MakeShared<FJsonObject>();
    Response->SetStringField(TEXT("type"), TEXT("result"));
    Response->SetStringField(TEXT("id"), Id);
    Response->SetStringField(TEXT("error"), ErrorMessage);
    Response->SetStringField(TEXT("error_code"), TEXT("request_error"));
    SendJson(Client, Response);
}

void FPagecranBridgeServer::SendJson(FClientConnection& Client, const TSharedPtr<FJsonObject>& Message) const
{
    if (Client.Socket == nullptr)
    {
        return;
    }

    const FString Payload = SerializeJsonLine(Message);
    FTCHARToUTF8 Utf8(*Payload);
    const uint8* Data = reinterpret_cast<const uint8*>(Utf8.Get());
    int32 TotalBytesSent = 0;

    while (TotalBytesSent < Utf8.Length())
    {
        int32 BytesSent = 0;
        if (!Client.Socket->Send(Data + TotalBytesSent, Utf8.Length() - TotalBytesSent, BytesSent) || BytesSent <= 0)
        {
            Client.Socket->Close();
            return;
        }

        TotalBytesSent += BytesSent;
    }
}

void FPagecranBridgeServer::BroadcastEvent(const FString& EventName, const TSharedPtr<FJsonObject>& Data)
{
    const TSharedPtr<FJsonObject> EventMessage = MakeEventMessage(EventName, Data);
    for (FClientConnection& Client : Clients)
    {
        if (Client.Socket != nullptr)
        {
            SendJson(Client, EventMessage);
        }
    }
}

TArray<int32> FPagecranBridgeServer::CollectDisconnectedClientIndexes() const
{
    TArray<int32> Result;
    for (int32 Index = 0; Index < Clients.Num(); ++Index)
    {
        const FClientConnection& Client = Clients[Index];
        if (Client.Socket == nullptr || Client.Socket->GetConnectionState() != ESocketConnectionState::SCS_Connected)
        {
            Result.Add(Index);
        }
    }
    return Result;
}

void FPagecranBridgeServer::RemoveClients(const TArray<int32>& Indexes)
{
    TArray<int32> Sorted = Indexes;
    Sorted.Sort(TGreater<int32>());

    for (int32 Index : Sorted)
    {
        if (!Clients.IsValidIndex(Index))
        {
            continue;
        }

        if (Clients[Index].Socket != nullptr)
        {
            Clients[Index].Socket->Close();
            ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(Clients[Index].Socket);
            Clients[Index].Socket = nullptr;
        }

        Clients.RemoveAt(Index);
    }
}
